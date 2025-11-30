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
  const [blocks, setBlocks] = useState({
    'L1-L2': { available: true },
    'L3-L4': { available: false }
  });

  const [statistics, setStatistics] = useState({
    total_occupancy_percent: 45,
    busiest_block: 'L3-L4',
    blocks: {
      'L1-L2': {
        peak_occupancy: 35,
        peak_time: '02:30 PM',
        total_events: 28,
        avg_duration_minutes: 45,
        avg_occupancy: 60
      },
      'L3-L4': {
        peak_occupancy: 38,
        peak_time: '03:15 PM',
        total_events: 31,
        avg_duration_minutes: 50,
        avg_occupancy: 75
      }
    },
    hourly_data: [
      { hour: '12 AM', occupied: 5 },
      { hour: '1 AM', occupied: 3 },
      { hour: '2 AM', occupied: 2 },
      { hour: '3 AM', occupied: 4 },
      { hour: '4 AM', occupied: 6 },
      { hour: '5 AM', occupied: 8 },
      { hour: '6 AM', occupied: 12 },
      { hour: '7 AM', occupied: 18 },
      { hour: '8 AM', occupied: 25 },
      { hour: '9 AM', occupied: 32 },
      { hour: '10 AM', occupied: 38 },
      { hour: '11 AM', occupied: 40 },
      { hour: '12 PM', occupied: 42 },
      { hour: '1 PM', occupied: 45 },
      { hour: '2 PM', occupied: 48 },
      { hour: '3 PM', occupied: 50 },
      { hour: '4 PM', occupied: 48 },
      { hour: '5 PM', occupied: 45 },
      { hour: '6 PM', occupied: 35 },
      { hour: '7 PM', occupied: 28 },
      { hour: '8 PM', occupied: 20 },
      { hour: '9 PM', occupied: 15 },
      { hour: '10 PM', occupied: 10 },
      { hour: '11 PM', occupied: 8 }
    ]
  });

  const [recentEvents, setRecentEvents] = useState([
    { spot_id: 'A-01', event_type: 'occupied', timestamp: new Date(Date.now() - 5 * 60000) },
    { spot_id: 'B-12', event_type: 'vacated', timestamp: new Date(Date.now() - 12 * 60000) },
    { spot_id: 'A-05', event_type: 'occupied', timestamp: new Date(Date.now() - 18 * 60000) },
    { spot_id: 'C-08', event_type: 'vacated', timestamp: new Date(Date.now() - 25 * 60000) },
    { spot_id: 'B-03', event_type: 'occupied', timestamp: new Date(Date.now() - 32 * 60000) },
    { spot_id: 'A-15', event_type: 'vacated', timestamp: new Date(Date.now() - 45 * 60000) },
    { spot_id: 'C-10', event_type: 'occupied', timestamp: new Date(Date.now() - 52 * 60000) },
    { spot_id: 'B-07', event_type: 'vacated', timestamp: new Date(Date.now() - 60 * 60000) },
    { spot_id: 'A-20', event_type: 'occupied', timestamp: new Date(Date.now() - 70 * 60000) },
    { spot_id: 'C-14', event_type: 'vacated', timestamp: new Date(Date.now() - 85 * 60000) }
  ]);

  const socketRef = useRef(null);

  useEffect(() => {

    const newSocket = io('http://localhost:3001');
    socketRef.current = newSocket;
    
    fetchStatistics();
    fetchRecentEvents();
    
    newSocket.on('block_update', (update) => {
      setBlocks(prevBlocks => ({
        ...prevBlocks,
        [update.block]: { available: update.available }
      }));
    });
    
    newSocket.on('new_event', (event) => {
      setRecentEvents(prev => [event, ...prev].slice(0, 10));
    });
    
    // const interval = setInterval(fetchStatistics, 60000);
    
    return () => {
      newSocket.close();
    //   clearInterval(interval);
    };



    // return () => clearInterval(interval);
  }, []);

  const fetchStatistics = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/statistics/today');
      setStatistics(response.data);
    } catch (error) {
      console.error('Error fetching statistics:', error);
    }
  };

  const fetchRecentEvents = async () => {
    try {
      const response = await axios.get('http://localhost:3001/api/events?limit=10');
      setRecentEvents(response.data);
    } catch (error) {
      console.error('Error fetching events:', error);
    }
  };

  return (
    <div className={styles.dashboard}>
      <div className={styles.container}>
        <div className={styles.dashboardHeader}>
          <h1>Parking Management Dashboard</h1>
          <p className={styles.subtitle}>Real-time monitoring and analytics</p>
        </div>

        <div className={styles.statsGrid}>
          <StatCard
            label="L1-L2 Block"
            value={blocks['L1-L2'].available ? 'AVAILABLE' : 'FULL'}
            color={blocks['L1-L2'].available ? 'success' : 'danger'}
          />
          <StatCard
            label="L3-L4 Block"
            value={blocks['L3-L4'].available ? 'AVAILABLE' : 'FULL'}
            color={blocks['L3-L4'].available ? 'success' : 'danger'}
          />
          <StatCard
            label="Total Occupancy"
            value={`${statistics.total_occupancy_percent}%`}
            color="info"
          />
          <StatCard
            label="Busiest Block"
            value={statistics.busiest_block}
            color="warning"
          />
        </div>

        <div className={styles.contentGrid}>
          <div className={styles.statCard}>
            <h5>Today's Statistics</h5>
            <ul className={styles.statsList}>
              <li>
                <strong>L1-L2 Peak:</strong> {statistics.blocks['L1-L2'].peak_occupancy}
                {' '}spots at {statistics.blocks['L1-L2'].peak_time}
              </li>
              <li>
                <strong>L3-L4 Peak:</strong> {statistics.blocks['L3-L4'].peak_occupancy}
                {' '}spots at {statistics.blocks['L3-L4'].peak_time}
              </li>
              <li>
                <strong>Total Events:</strong> {statistics.blocks['L1-L2'].total_events + statistics.blocks['L3-L4'].total_events}
              </li>
              <li>
                <strong>Avg Duration:</strong> {statistics.blocks['L1-L2'].avg_duration_minutes} min
              </li>
            </ul>
          </div>

          <div className={styles.statCard}>
            <h5>Recent Activity</h5>
            <div className={styles.eventsList}>
              {recentEvents.length > 0 ? (
                recentEvents.map((event, index) => (
                  <div key={index} className={styles.eventItem}>
                    <span className={`${styles.eventType} ${styles[event.event_type]}`}>
                      {event.event_type === 'occupied' ? '🚗' : '✓'}
                    </span>
                    <strong>{event.spot_id}</strong>: {event.event_type}
                    <small className={styles.eventTime}>
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </small>
                  </div>
                ))
              ) : (
                <p className={styles.noEvents}>No recent events</p>
              )}
            </div>
          </div>
        </div>

        <div className={styles.chartsGrid}>
          <div className={styles.chartContainer}>
            <h5>Occupancy Over Time (Last 24 Hours)</h5>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={statistics.hourly_data}>
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
                  dataKey="occupied" 
                  stroke="#3b82f6" 
                  strokeWidth={3}
                  dot={{ fill: '#3b82f6', r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className={styles.chartContainer}>
            <h5>Block Comparison</h5>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={[
                {
                  name: 'L1-L2',
                  'Avg Occupancy': statistics.blocks['L1-L2'].avg_occupancy
                },
                {
                  name: 'L3-L4',
                  'Avg Occupancy': statistics.blocks['L3-L4'].avg_occupancy
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
                <Bar dataKey="Avg Occupancy" fill="#10b981" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Dashboard;
