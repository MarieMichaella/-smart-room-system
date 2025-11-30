import React from 'react';
import styles from './StatCard.module.css';

function StatCard({ label, value, color, subtext }) {
  return (
    <div className={`${styles.statCard} ${styles[color]}`}>
      <div className={styles.statLabel}>{label}</div>
      <div className={styles.statValue}>{value}</div>
      {subtext && <small className={styles.statSubtext}>{subtext}</small>}
    </div>
  );
}

export default StatCard;
