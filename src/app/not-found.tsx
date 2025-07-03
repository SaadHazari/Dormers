'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function NotFound() {
  const router = useRouter();

  useEffect(() => {
    // Get the current path
    const path = window.location.pathname;
    
    // Store the path in session storage
    sessionStorage.setItem('redirectPath', path);
    
    // Redirect to home
    router.push('/');
  }, [router]);

  return null;
} 