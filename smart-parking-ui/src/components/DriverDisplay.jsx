import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';  
import styles from './DriverDisplay.module.css';
import BlockCard from './BlockCard';

function DriverDisplay() {
  const [blocks, setBlocks] = useState({
    'L1-L2': { 
      available: true, 
      lastUpdate: new Date()
    },
    'L3-L4': { 
      available: false, 
      lastUpdate: new Date()
    }
  });

  const [connected, setConnected] = useState(true);
  const socketRef = useRef(null);

  useEffect(() => {
    // Socket.io connection setup
    const newSocket = io('http://localhost:3001');
    socketRef.current = newSocket;
    
    newSocket.on('connect', () => {
      console.log('Connected to server');
      setConnected(true);
      newSocket.emit('request_initial_state');
    });
    
    newSocket.on('disconnect', () => {
      setConnected(false);
    });
    
    newSocket.on('initial_state', (data) => {
      console.log('Initial state:', data);
      setBlocks(data);
    });
    
    newSocket.on('block_update', (update) => {
      console.log('Block update:', update);
      setBlocks(prevBlocks => ({
        ...prevBlocks,
        [update.block]: {
          ...prevBlocks[update.block],
          available: update.available,
          lastUpdate: new Date()
        }
      }));
    });
    
    // Update timestamp every 5 seconds 
    // const interval = setInterval(() => {
    //   setBlocks(prev => ({
    //     ...prev,
    //     'L1-L2': {
    //       ...prev['L1-L2'],
    //       lastUpdate: new Date()
    //     }
    //   }));
    // }, 5000);
  
    return () => {
      newSocket.close();
      // clearInterval(interval);  // if using interval
    };
  }, []);

  const formatTime = (date) => {
    if (!date) return 'Never';
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const hours = Math.floor(diffMins / 60);
    if (hours < 24) return `${hours}h ago`;
    
    return date.toLocaleDateString();
  };

  return (
    <div className={styles.driverDisplay}>
      {/* Header Section */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <div>
            <h1 className={styles.title}>PARKING AVAILABILITY</h1>
            <p className={styles.subtitle}>Real-time parking status</p>
          </div>
          <div className={`${styles.connectionStatus} ${connected ? styles.connected : styles.disconnected}`}>
            <span className={styles.dot}></span>
            {connected ? 'LIVE' : 'OFFLINE'}
          </div>
        </div>
      </div>

      {/* Blocks Grid */}
      <div className={styles.blocksContainer}>
        {Object.entries(blocks).map(([blockName, blockData]) => (
          <BlockCard
            key={blockName}
            blockName={blockName}
            available={blockData.available}
            lastUpdate={blockData.lastUpdate}
          />
        ))}
      </div>

      {/* Footer Section */}
      <div className={styles.footer}>
        <div className={styles.qrSection}>
          <div className={styles.qrPlaceholder}>
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="80" height="80" fill="white"/>
              <rect x="6" y="6" width="20" height="20" fill="black"/>
              <rect x="8" y="8" width="16" height="16" fill="white"/>
              <rect x="10" y="10" width="12" height="12" fill="black"/>
              <rect x="54" y="6" width="20" height="20" fill="black"/>
              <rect x="56" y="8" width="16" height="16" fill="white"/>
              <rect x="58" y="10" width="12" height="12" fill="black"/>
              <rect x="6" y="54" width="20" height="20" fill="black"/>
              <rect x="8" y="56" width="16" height="16" fill="white"/>
              <rect x="10" y="58" width="12" height="12" fill="black"/>
            </svg>
          </div>
          <p className={styles.qrText}>Scan QR code for detailed dashboard</p>
        </div>
      </div>
    </div>
  );
}

export default DriverDisplay;