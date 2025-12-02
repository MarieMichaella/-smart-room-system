// ==========================================
// LOAD ENVIRONMENT VARIABLES FIRST
// ==========================================
require('dotenv').config();

// ==========================================
// IMPORTS
// ==========================================
const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const { EventHubConsumerClient, earliestEventPosition } = require("@azure/event-hubs");
const { Pool } = require('pg');

// ==========================================
// SERVER SETUP
// ==========================================
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT']
  }
});

const PORT = process.env.PORT || 3001;

// ==========================================
// AZURE EVENT HUB CONFIGURATION
// ==========================================
const connectionString = process.env.AZURE_CONNECTION_STRING;
const eventHubName = process.env.AZURE_EVENT_HUB_NAME;
const consumerGroup = process.env.AZURE_CONSUMER_GROUP || "$Default";

// ==========================================
// POSTGRESQL CONNECTION
// ==========================================
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: parseInt(process.env.DB_PORT),
});

// Test PostgreSQL connection
pool.query('SELECT NOW()', (err, res) => {
  if (err) {
    console.error('❌ PostgreSQL connection error:', err);
  } else {
    console.log('✅ PostgreSQL connected:', res.rows[0].now);
  }
});

// ==========================================
// MIDDLEWARE
// ==========================================
app.use(cors());
app.use(express.json());

// ==========================================
// IN-MEMORY DATA STORAGE
// ==========================================

// Individual parking spot (only spot4L2 for now)
let parkingSpots = {
  'spot4L2': { 
    deviceId: 'spot4L2', 
    irDetected: false, 
    leftDistance: '304.00', 
    rightDistance: '304.00',
    isCarParked: false, 
    lastUpdate: new Date(), 
    block: 'L1-L2' 
  }
};

// Block status will be calculated from parkingSpots
let blockStatus = {
  'L1-L2': { 
    available: true,
    totalSpots: 1,
    occupiedSpots: 0,
    availableSpots: 1,
    lastUpdate: new Date()
  }
};

// Recent events log (in-memory for quick access)
let recentEvents = [];

// ==========================================
// HELPER FUNCTIONS
// ==========================================

async function processSensorData(sensorData) {
  const { deviceId, timestamp, metalDetected, leftDistance, rightDistance, isCarParked } = sensorData;
  
  // Validate deviceId
  if (!deviceId || deviceId === 'undefined' || deviceId === 'null') {
    console.log('⚠️ Invalid deviceId received:', deviceId);
    return;
  }
  
  // If this is a new device, initialize it
  if (!parkingSpots[deviceId]) {
    let block = 'L1-L2';
    if (deviceId.includes('L3') || deviceId.includes('L4')) {
      block = 'L3-L4';
    }
    
    parkingSpots[deviceId] = {
      deviceId: deviceId,
      irDetected: false,
      leftDistance: '304.00',
      rightDistance: '304.00',
      isCarParked: false,
      lastUpdate: new Date(),
      block: block
    };
    
    console.log(`📍 New parking spot registered: ${deviceId} in ${block}`);
  }
  
  // Store previous state for event detection
  const previousState = parkingSpots[deviceId].isCarParked;
  
  // Update spot data
  parkingSpots[deviceId] = {
    ...parkingSpots[deviceId],
    irDetected: metalDetected !== undefined ? metalDetected : parkingSpots[deviceId].irDetected,
    leftDistance: leftDistance || parkingSpots[deviceId].leftDistance,
    rightDistance: rightDistance || parkingSpots[deviceId].rightDistance,
    isCarParked: isCarParked !== undefined ? isCarParked : parkingSpots[deviceId].isCarParked,
    lastUpdate: timestamp ? new Date(timestamp) : new Date()
  };
  
  // Update block status for L1-L2
  if (isCarParked) {
    blockStatus['L1-L2'].occupiedSpots = 1;
    blockStatus['L1-L2'].availableSpots = 0;
    blockStatus['L1-L2'].available = false;
  } else {
    blockStatus['L1-L2'].occupiedSpots = 0;
    blockStatus['L1-L2'].availableSpots = 1;
    blockStatus['L1-L2'].available = true;
  }
  blockStatus['L1-L2'].lastUpdate = new Date();
  
  // Broadcast updates to connected clients
  io.emit('block_update', blockStatus);
  io.emit('spot_update', parkingSpots[deviceId]);
  
  // If state changed, log to database and create event
  if (previousState !== isCarParked) {
    const eventType = isCarParked ? 'occupied' : 'freed';
    
    // Log to database
    try {
      const result = await pool.query(`
        INSERT INTO events (device_id, event_type, timestamp, left_distance, right_distance, metal_detected)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id
      `, [
        deviceId,
        eventType,
        timestamp || new Date().toISOString(),
        parseFloat(leftDistance),
        parseFloat(rightDistance || 0),
        metalDetected
      ]);
      
      console.log(`💾 DB: ${eventType.toUpperCase()} - ${deviceId} (Event ID: ${result.rows[0].id})`);
    } catch (error) {
      console.error('❌ Database insert error:', error.message);
    }
    
    // Add to recent events (in-memory)
    const event = {
      spot_id: deviceId,
      block: parkingSpots[deviceId].block,
      event_type: eventType,
      timestamp: timestamp || new Date().toISOString(),
      sensor_data: {
        metalDetected,
        leftDistance,
        rightDistance
      }
    };
    
    recentEvents.unshift(event);
    recentEvents = recentEvents.slice(0, 50); // Keep last 50 events
    
    // Broadcast event to all connected clients
    io.emit('new_event', event);
    
    console.log(`🚗 ${eventType.toUpperCase()}: ${deviceId}`);
  }
}

// ==========================================
// AZURE EVENT HUB INTEGRATION
// ==========================================

async function startEventHubListener() {
  if (!connectionString || !eventHubName) {
    console.log('⚠️  Azure Event Hub not configured. Set AZURE_CONNECTION_STRING and AZURE_EVENT_HUB_NAME in .env');
    console.log('   You can still test with the API endpoints');
    return;
  }

  try {
    console.log('🔌 Connecting to Azure Event Hub...');
    
    const consumerClient = new EventHubConsumerClient(
      consumerGroup, 
      connectionString, 
      eventHubName
    );

    consumerClient.subscribe({
      processEvents: async (events) => {
        if (events.length === 0) return;

        for (const event of events) {
          try {
            // Decode base64 data from Azure Event Hub
            const decodedData = Buffer.from(event.body[0].data.body, 'base64').toString('utf-8');
            const sensorData = JSON.parse(decodedData);
            
            console.log(`📥 ${JSON.stringify(sensorData)}`);
            
            // Process the sensor data
            await processSensorData(sensorData);
            
          } catch (error) {
            console.error('Error processing event:', error);
          }
        }
      },

      processError: async (err, context) => {
        console.error(`❌ Error on partition ${context.partitionId}:`, err);
      }
    },
    { startPosition: earliestEventPosition });

    console.log('✅ Azure Event Hub connected\n');

  } catch (error) {
    console.error('❌ Failed to connect to Event Hub:', error.message);
    console.log('   You can still test with the API endpoints\n');
  }
}

// ==========================================
// API ROUTES
// ==========================================

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Parking Backend API',
    status: 'running',
    version: '2.0.0',
    eventHubConnected: !!connectionString && !!eventHubName,
    databaseConnected: pool.totalCount >= 0,
    activeSpots: Object.keys(parkingSpots).length,
    endpoints: {
      blocks: '/api/blocks',
      spots: '/api/spots',
      events: '/api/events',
      statistics: {
        today: '/api/statistics/today',
        hourlyEvents: '/api/statistics/hourly-events',
        allEvents: '/api/events/all'
      }
    }
  });
});

// GET block status
app.get('/api/blocks', (req, res) => {
  res.json(blockStatus);
});

// GET all parking spots
app.get('/api/spots', (req, res) => {
  res.json(parkingSpots);
});

// GET specific spot
app.get('/api/spots/:deviceId', (req, res) => {
  const { deviceId } = req.params;
  const spot = parkingSpots[deviceId];
  
  if (!spot) {
    return res.status(404).json({ error: 'Spot not found' });
  }
  
  res.json(spot);
});

// GET recent events (from memory)
app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  res.json(recentEvents.slice(0, limit));
});

// POST - Manual sensor data update (for testing)
app.post('/api/sensor/update', async (req, res) => {
  const sensorData = req.body;
  
  if (!sensorData.deviceId) {
    return res.status(400).json({ error: 'deviceId is required' });
  }
  
  await processSensorData(sensorData);
  
  res.json({
    success: true,
    spot: parkingSpots[sensorData.deviceId],
    blockStatus: blockStatus[parkingSpots[sensorData.deviceId]?.block]
  });
});

// ==========================================
// STATISTICS API ENDPOINTS (PostgreSQL)
// ==========================================

// Get hourly events for today
app.get('/api/statistics/hourly-events', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        EXTRACT(HOUR FROM timestamp)::INTEGER as hour,
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'occupied' THEN 1 ELSE 0 END) as occupied_events,
        SUM(CASE WHEN event_type = 'freed' THEN 1 ELSE 0 END) as freed_events
      FROM events
      WHERE DATE(timestamp) = CURRENT_DATE
      GROUP BY hour
      ORDER BY hour
    `);
    
    // Fill missing hours with 0
    const hourlyData = Array.from({ length: 24 }, (_, i) => {
      const found = result.rows.find(row => row.hour === i);
      return {
        hour: `${i.toString().padStart(2, '0')}:00`,
        total_events: found ? parseInt(found.total_events) : 0,
        occupied_events: found ? parseInt(found.occupied_events) : 0,
        freed_events: found ? parseInt(found.freed_events) : 0
      };
    });
    
    res.json(hourlyData);
  } catch (error) {
    console.error('Error fetching hourly events:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get today's summary
app.get('/api/statistics/today', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'occupied' THEN 1 ELSE 0 END) as cars_parked,
        SUM(CASE WHEN event_type = 'freed' THEN 1 ELSE 0 END) as cars_left,
        AVG(duration_minutes) as avg_duration
      FROM events
      WHERE DATE(timestamp) = CURRENT_DATE
        AND device_id = 'spot4L2'
    `);
    
    const stats = result.rows[0] || {
      total_events: 0,
      cars_parked: 0,
      cars_left: 0,
      avg_duration: 0
    };
    
    res.json({
      date: new Date().toISOString().split('T')[0],
      device_id: 'spot4L2',
      total_events: parseInt(stats.total_events) || 0,
      cars_parked: parseInt(stats.cars_parked) || 0,
      cars_left: parseInt(stats.cars_left) || 0,
      avg_duration: parseFloat(stats.avg_duration) || 0,
      blocks: {
        'L1-L2': {
          total_spots: 1,
          current_status: blockStatus['L1-L2']
        }
      }
    });
  } catch (error) {
    console.error('Error fetching today stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get all events from database (for debugging/analysis)
app.get('/api/events/all', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 100;
    const result = await pool.query(`
      SELECT * FROM events 
      ORDER BY timestamp DESC 
      LIMIT $1
    `, [limit]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Get weekly trends
app.get('/api/statistics/weekly', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        DATE(timestamp) as date,
        COUNT(*) as total_events,
        SUM(CASE WHEN event_type = 'occupied' THEN 1 ELSE 0 END) as cars_parked,
        SUM(CASE WHEN event_type = 'freed' THEN 1 ELSE 0 END) as cars_left,
        AVG(duration_minutes) as avg_duration
      FROM events
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      GROUP BY DATE(timestamp)
      ORDER BY date
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching weekly stats:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// ==========================================
// WEBSOCKET HANDLERS
// ==========================================

io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);
  
  // Send initial state when client requests it
  socket.on('request_initial_state', () => {
    console.log('📤 Sending initial state to client:', socket.id);
    
    // Only send valid blocks
    const cleanBlocks = { 'L1-L2': blockStatus['L1-L2'] };
    
    socket.emit('initial_state', cleanBlocks);
    socket.emit('spots_state', parkingSpots);
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, async () => {
  console.log('');
  console.log('===========================================');
  console.log('🚀 Smart Parking Backend Server v2.0');
  console.log('===========================================');
  console.log(`📡 Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready for connections`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/`);
  console.log(`   GET  http://localhost:${PORT}/api/blocks`);
  console.log(`   GET  http://localhost:${PORT}/api/spots`);
  console.log(`   GET  http://localhost:${PORT}/api/events`);
  console.log(`   GET  http://localhost:${PORT}/api/statistics/today`);
  console.log(`   GET  http://localhost:${PORT}/api/statistics/hourly-events`);
  console.log(`   GET  http://localhost:${PORT}/api/statistics/weekly`);
  console.log(`   POST http://localhost:${PORT}/api/sensor/update`);
  console.log('');
  console.log('📍 Active Parking Spots:');
  Object.keys(parkingSpots).forEach(spotId => {
    console.log(`   - ${spotId} (${parkingSpots[spotId].block})`);
  });
  console.log('===========================================');
  console.log('');
  
  // Start Azure Event Hub listener
  await startEventHubListener();
});

// ==========================================
// GRACEFUL SHUTDOWN
// ==========================================

process.on('SIGINT', async () => {
  console.log('\n\n👋 Shutting down gracefully...');
  await pool.end();
  console.log('✅ Database connections closed');
  process.exit(0);
});