"use client";
import dynamic from 'next/dynamic';

const ScheduleViewer = dynamic(() => import('@/components/ScheduleViewer'), { 
  ssr: false,
  loading: () => <p>Loading Calendar...</p> 
});

export default function Home() {
  return (
    <main style={{ minHeight: '100vh', background: '#fff' }}>
      <ScheduleViewer />
    </main>
  );
}

