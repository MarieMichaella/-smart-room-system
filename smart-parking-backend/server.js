const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: 'http://localhost:3000',
    methods: ['GET', 'POST', 'PUT']
  }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// ==========================================
// IN-MEMORY DATA STORAGE (No Database)
// ==========================================

// Block status (what the 2 Raspberry Pis would report)
let blockStatus = {
  'L1-L2': {
    available: true,
    lastUpdate: new Date(),
    sensor_data: {
      ultrasonic_avg: 2.5,
      ir_detected: false
    }
  },
  'L3-L4': {
    available: false,
    lastUpdate: new Date(),
    sensor_data: {
      ultrasonic_avg: 0.6,
      ir_detected: true
    }
  }
};

// Recent events log
let recentEvents = [
  {
    spot_id: 'L1-01',
    event_type: 'freed',
    timestamp: new Date(Date.now() - 300000).toISOString()
  },
  {
    spot_id: 'L3-05',
    event_type: 'occupied',
    timestamp: new Date(Date.now() - 600000).toISOString()
  },
  {
    spot_id: 'L2-03',
    event_type: 'freed',
    timestamp: new Date(Date.now() - 900000).toISOString()
  }
];

// Today's statistics (mock data)
const getTodayStats = () => {
  return {
    date: new Date().toISOString().split('T')[0],
    blocks: {
      'L1-L2': {
        total_spots: 20,
        peak_occupancy: 15,
        peak_time: '14:30',
        avg_occupancy: 12.5,
        total_events: 45,
        avg_duration_minutes: 180
      },
      'L3-L4': {
        total_spots: 20,
        peak_occupancy: 18,
        peak_time: '15:00',
        avg_occupancy: 14.2,
        total_events: 52,
        avg_duration_minutes: 165
      }
    },
    total_occupancy_percent: 65.5,
    busiest_block: 'L3-L4',
    hourly_data: Array.from({ length: 24 }, (_, i) => {
      const occupied = Math.floor(Math.random() * 15) + 10;
      return {
        hour: `${i.toString().padStart(2, '0')}:00`,
        occupied: occupied,
        available: 40 - occupied,
        occupancy_percent: (occupied / 40) * 100
      };
    }),
    busiest_spots: [
      { spot_id: 'L1-05', occupancy_count: 8 },
      { spot_id: 'L3-08', occupancy_count: 7 },
      { spot_id: 'L2-02', occupancy_count: 6 }
    ]
  };
};

// ==========================================
// API ROUTES
// ==========================================

// Health check
app.get('/', (req, res) => {
  res.json({
    message: 'Smart Parking Backend API',
    status: 'running',
    version: '1.0.0',
    endpoints: {
      blocks: '/api/blocks',
      events: '/api/events',
      statistics: '/api/statistics/today'
    }
  });
});

// GET block status
app.get('/api/blocks', (req, res) => {
  res.json(blockStatus);
});

// GET statistics for today
app.get('/api/statistics/today', (req, res) => {
  const stats = getTodayStats();
  res.json(stats);
});

// GET recent events
app.get('/api/events', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  res.json(recentEvents.slice(0, limit));
});

// POST - Update block status (for Raspberry Pi to call later)
app.post('/api/blocks/:blockId/update', (req, res) => {
  const { blockId } = req.params;
  const { available, sensor_data } = req.body;
  
  if (!blockStatus[blockId]) {
    return res.status(404).json({ error: 'Block not found' });
  }
  
  // Update block status
  blockStatus[blockId] = {
    available: available,
    lastUpdate: new Date(),
    sensor_data: sensor_data || blockStatus[blockId].sensor_data
  };
  
  // Broadcast to all connected clients
  io.emit('block_update', {
    block: blockId,
    available: available,
    timestamp: new Date()
  });
  
  // Add event
  const newEvent = {
    spot_id: blockId,
    event_type: available ? 'freed' : 'occupied',
    timestamp: new Date().toISOString()
  };
  
  recentEvents.unshift(newEvent);
  recentEvents = recentEvents.slice(0, 20); // Keep last 20
  
  io.emit('new_event', newEvent);
  
  res.json({
    success: true,
    block: blockId,
    status: blockStatus[blockId]
  });
});

// POST - Simulate sensor data change (for testing UI)
app.post('/api/simulate/toggle/:blockId', (req, res) => {
  const { blockId } = req.params;
  
  if (!blockStatus[blockId]) {
    return res.status(404).json({ error: 'Block not found' });
  }
  
  // Toggle availability
  blockStatus[blockId].available = !blockStatus[blockId].available;
  blockStatus[blockId].lastUpdate = new Date();
  
  // Broadcast update
  io.emit('block_update', {
    block: blockId,
    available: blockStatus[blockId].available,
    timestamp: new Date()
  });
  
  // Add event
  const newEvent = {
    spot_id: blockId,
    event_type: blockStatus[blockId].available ? 'freed' : 'occupied',
    timestamp: new Date().toISOString()
  };
  
  recentEvents.unshift(newEvent);
  io.emit('new_event', newEvent);
  
  res.json({
    success: true,
    block: blockId,
    newStatus: blockStatus[blockId]
  });
});

// ==========================================
// WEBSOCKET HANDLERS
// ==========================================

io.on('connection', (socket) => {
  console.log('✅ New client connected:', socket.id);
  
  // Send initial state when client requests it
  socket.on('request_initial_state', () => {
    console.log('📤 Sending initial state to client:', socket.id);
    socket.emit('initial_state', blockStatus);
  });
  
  // Handle Raspberry Pi sensor updates (for future)
  socket.on('pi_sensor_update', (data) => {
    console.log('🔧 Raspberry Pi update:', data);
    
    const { block, available, sensor_data } = data;
    
    if (blockStatus[block]) {
      blockStatus[block] = {
        available: available,
        lastUpdate: new Date(),
        sensor_data: sensor_data
      };
      
      // Broadcast to all clients
      io.emit('block_update', {
        block: block,
        available: available,
        timestamp: new Date()
      });
    }
  });
  
  socket.on('disconnect', () => {
    console.log('❌ Client disconnected:', socket.id);
  });
});

// ==========================================
// AUTO-SIMULATION (Optional - for demo)
// ==========================================

// Simulate random changes every 30 seconds (for demo purposes)
let simulationEnabled = false;

if (simulationEnabled) {
  setInterval(() => {
    const blocks = ['L1-L2', 'L3-L4'];
    const randomBlock = blocks[Math.floor(Math.random() * blocks.length)];
    
    blockStatus[randomBlock].available = !blockStatus[randomBlock].available;
    blockStatus[randomBlock].lastUpdate = new Date();
    
    io.emit('block_update', {
      block: randomBlock,
      available: blockStatus[randomBlock].available,
      timestamp: new Date()
    });
    
    const newEvent = {
      spot_id: randomBlock,
      event_type: blockStatus[randomBlock].available ? 'freed' : 'occupied',
      timestamp: new Date().toISOString()
    };
    
    recentEvents.unshift(newEvent);
    recentEvents = recentEvents.slice(0, 20);
    
    io.emit('new_event', newEvent);
    
    console.log(`🔄 Auto-simulated: ${randomBlock} -> ${blockStatus[randomBlock].available ? 'AVAILABLE' : 'FULL'}`);
  }, 30000);
}

// ==========================================
// START SERVER
// ==========================================

server.listen(PORT, () => {
  console.log('');
  console.log('===========================================');
  console.log('🚀 Smart Parking Backend Server');
  console.log('===========================================');
  console.log(`📡 Server running on: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket ready for connections`);
  console.log('');
  console.log('📋 Available Endpoints:');
  console.log(`   GET  http://localhost:${PORT}/`);
  console.log(`   GET  http://localhost:${PORT}/api/blocks`);
  console.log(`   GET  http://localhost:${PORT}/api/statistics/today`);
  console.log(`   GET  http://localhost:${PORT}/api/events?limit=10`);
  console.log(`   POST http://localhost:${PORT}/api/simulate/toggle/L1-L2`);
  console.log(`   POST http://localhost:${PORT}/api/simulate/toggle/L3-L4`);
  console.log('');
  console.log('💡 Test simulation:');
  console.log(`   curl -X POST http://localhost:${PORT}/api/simulate/toggle/L1-L2`);
  console.log('===========================================');
  console.log('');
});