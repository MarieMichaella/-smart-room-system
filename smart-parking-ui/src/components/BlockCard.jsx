import React from 'react';
import styles from './BlockCard.module.css';

function BlockCard({ blockName, available, lastUpdate }) {
  return (
    <div className={`${styles.blockCard} ${available ? styles.available : styles.full}`}>
      <div className={styles.blockName}>{blockName}</div>
      
      <div className={styles.statusIcon}>
        {available ? (
          <div className={styles.iconAvailable}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="#00cc00" />
              <path d="M 40 60 L 55 75 L 85 45" stroke="white" strokeWidth="8" fill="none" />
            </svg>
          </div>
        ) : (
          <div className={styles.iconFull}>
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle cx="60" cy="60" r="50" fill="#ff0000" />
              <path d="M 40 40 L 80 80 M 80 40 L 40 80" stroke="white" strokeWidth="8" />
            </svg>
          </div>
        )}
      </div>
      
      <div className={styles.statusText}>
        {available ? 'AVAILABLE' : 'FULL'}
      </div>
      
      {lastUpdate && (
        <div className={styles.lastUpdate}>
            Updated: {new Date(lastUpdate).toLocaleTimeString()}
        </div>
        )}
    </div>
  );
}

export default BlockCard;
