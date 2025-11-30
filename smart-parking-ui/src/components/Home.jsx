import React from 'react';
import { Link } from 'react-router-dom';
import styles from './Home.module.css';

export default function Home() {
  return (
    <div className={styles.home}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Smart Parking System</h1>
          <p className={styles.subtitle}>Real-time parking management & monitoring</p>
        </div>

        <div className={styles.navLinks}>
          <Link to="/display" className={styles.navButton}>
            <div className={styles.buttonIcon}>🚗</div>
            <div className={styles.buttonContent}>
              <div className={styles.buttonTitle}>Driver Display</div>
              <div className={styles.buttonDescription}>View parking availability in real-time</div>
            </div>
          </Link>

          <Link to="/dashboard" className={styles.navButton}>
            <div className={styles.buttonIcon}>📊</div>
            <div className={styles.buttonContent}>
              <div className={styles.buttonTitle}>Manager Dashboard</div>
              <div className={styles.buttonDescription}>Monitor analytics and occupancy data</div>
            </div>
          </Link>
        </div>

        <div className={styles.footer}>
          <p>Parking Management System v1.0</p>
        </div>
      </div>
    </div>
  );
}
