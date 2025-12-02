import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import axios from 'axios';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import styles from './Dashboard.module.css';
import StatCard from './StatCard';

function Dashboard() {
  // Real-time block status
  const [blocks, setBlocks] = useState({
    'L1-L2': { available: true, totalSpots: 1, occupiedSpots: 0, availableSpots: 1 }
  });

  // Today's statistics from database
  const [todayStats, setTodayStats] = useState({
    total_events: 0,
    cars_parked: 0,
    cars_left: 0,
    avg_duration: 0
  });

  // Hourly event data
  const [hourlyData, setHourlyData] = useState([]);

  // Recent events
  const [recentEvents, setRecentEvents] = useState([]);

  const socketRef = useRef(null);

  useEffect(() => {
    // Socket.io connection for real-time updates
    const newSocket = io('http://localhost:3001');
    socketRef.current = newSocket;
    
    // Fetch initial data
    fetchAllStatistics();
    
    // Listen for real-time block updates
    newSocket.on('block_update', (updatedBlocks) => {
      console.log('Block update:', updatedBlocks);
      setBlocks(updatedBlocks);
    });
    
    // Listen for new events
    newSocket.on('new_event', (event) => {
      console.log('New event:', event);
      setRecentEvents(prev => [event, ...prev].slice(0, 10));
      // Refresh statistics when new event occurs
      fetchAllStatistics();
    });
    
    // Refresh statistics every minute
    const interval = setInterval(fetchAllStatistics, 60000);
    
    return () => {
      newSocket.close();
      clearInterval(interval);
    };
  }, []);

  const fetchAllStatistics = async () => {
    try {
      // Fetch today's summary
      const todayResponse = await axios.get('http://localhost:3001/api/statistics/today');
      setTodayStats(todayResponse.data);
      
      // Fetch hourly events
      const hourlyResponse = await axios.get('http://localhost:3001/api/statistics/hourly-events');
      setHourlyData(hourlyResponse.data);
      
      // Fetch recent events
      const eventsResponse = await axios.get('http://localhost:3001/api/events?limit=10');
      setRecentEvents(eventsResponse.data);
      
      console.log('✅ Statistics refreshed');
    } catch (error) {
      console.error('❌ Error fetching statistics:', error);
    }
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.container}>
        {/* Header */}
        <div className={styles.dashboardHeader}>
          <h1>Parking Management Dashboard</h1>
          <p className={styles.subtitle}>Real-time monitoring and analytics - spot4L2</p>
        </div>

        {/* Stats Grid - Real Data */}
        <div className={styles.statsGrid}>
          <StatCard
            label="Current Status"
            value={blocks['L1-L2']?.available ? 'AVAILABLE' : 'OCCUPIED'}
            color={blocks['L1-L2']?.available ? 'success' : 'danger'}
            subtext={`spot4L2 (L1-L2)`}
          />
          <StatCard
            label="Total Events Today"
            value={todayStats.total_events || 0}
            color="info"
            subtext={`${todayStats.cars_parked || 0} parked, ${todayStats.cars_left || 0} left`}
          />
          <StatCard
            label="Cars Parked Today"
            value={todayStats.cars_parked || 0}
            color="warning"
            subtext="Total vehicles"
          />
          <StatCard
            label="Avg Duration"
            value={todayStats.avg_duration ? `${Math.round(todayStats.avg_duration)} min` : 'N/A'}
            color="info"
            subtext="Average parking time"
          />
        </div>

        {/* Content Grid */}
        <div className={styles.contentGrid}>
          {/* Today's Statistics */}
          <div className={styles.statCard}>
            <h5>Today's Statistics</h5>
            <ul className={styles.statsList}>
              <li>
                <strong>Total Events:</strong> {todayStats.total_events || 0}
              </li>
              <li>
                <strong>Cars Parked:</strong> {todayStats.cars_parked || 0}
              </li>
              <li>
                <strong>Cars Left:</strong> {todayStats.cars_left || 0}
              </li>
              <li>
                <strong>Average Duration:</strong> {todayStats.avg_duration ? `${Math.round(todayStats.avg_duration)} minutes` : 'N/A'}
              </li>
              <li>
                <strong>Current Status:</strong> {blocks['L1-L2']?.available ? '✓ Available' : '🚗 Occupied'}
              </li>
              <li>
                <strong>Spot:</strong> spot4L2 (Block L1-L2)
              </li>
            </ul>
          </div>

          {/* Recent Activity */}
          <div className={styles.statCard}>
            <h5>Recent Activity</h5>
            <div className={styles.eventsList}>
              {recentEvents.length > 0 ? (
                recentEvents.map((event, index) => (
                  <div key={index} className={styles.eventItem}>
                    <span className={`${styles.eventType} ${styles[event.event_type]}`}>
                      {event.event_type === 'occupied' ? '🚗' : '✓'}
                    </span>
                    <strong>{event.spot_id || event.device_id}</strong>: {event.event_type}
                    <small className={styles.eventTime}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </small>
                  </div>
                ))
              ) : (
                <p className={styles.noEvents}>No events recorded yet today</p>
              )}
            </div>
          </div>
        </div>

        {/* Charts Grid */}
        <div className={styles.chartsGrid}>
          {/* Hourly Events Chart */}
          <div className={styles.chartContainer}>
            <h5>Events Per Hour (Today)</h5>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={hourlyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="hour" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                  cursor={{ stroke: '#3b82f6' }}
                />
                <Legend />
                <Line 
                  type="monotone" 
                  dataKey="total_events" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                  name="Total Events"
                />
                <Line 
                  type="monotone" 
                  dataKey="occupied_events" 
                  stroke="#ef4444" 
                  strokeWidth={2}
                  dot={{ fill: '#ef4444', r: 3 }}
                  name="Cars Parked"
                />
                <Line 
                  type="monotone" 
                  dataKey="freed_events" 
                  stroke="#10b981" 
                  strokeWidth={2}
                  dot={{ fill: '#10b981', r: 3 }}
                  name="Cars Left"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Event Type Breakdown */}
          <div className={styles.chartContainer}>
            <h5>Event Breakdown (Today)</h5>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                {
                  name: 'Parked',
                  count: todayStats.cars_parked || 0,
                  fill: '#ef4444'
                },
                {
                  name: 'Left',
                  count: todayStats.cars_left || 0,
                  fill: '#10b981'
                }
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="name" stroke="#9ca3af" />
                <YAxis stroke="#9ca3af" />
                <Tooltip 
                  contentStyle={{
                    backgroundColor: '#fff',
                    border: '1px solid #e5e7eb',
                    borderRadius: '8px'
                  }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {[
                    { name: 'Parked', count: todayStats.cars_parked || 0, fill: '#ef4444' },
                    { name: 'Left', count: todayStats.cars_left || 0, fill: '#10b981' }
                  ].map((entry, index) => (
                    <Bar key={`cell-${index}`} dataKey="count" fill={entry.fill} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Spot Details Card */}
        <div className={styles.statCard}>
          <h5>Spot Details - spot4L2</h5>
          <ul className={styles.statsList}>
            <li>
              <strong>Block:</strong> L1-L2
            </li>
            <li>
              <strong>Total Spots in Block:</strong> {blocks['L1-L2']?.totalSpots || 1}
            </li>
            <li>
              <strong>Currently Occupied:</strong> {blocks['L1-L2']?.occupiedSpots || 0}
            </li>
            <li>
              <strong>Currently Available:</strong> {blocks['L1-L2']?.availableSpots || 1}
            </li>
            <li>
              <strong>Last Updated:</strong> {blocks['L1-L2']?.lastUpdate ? new Date(blocks['L1-L2'].lastUpdate).toLocaleString() : 'N/A'}
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;