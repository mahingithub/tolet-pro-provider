import React from 'react';
import { Loader2 } from 'lucide-react';

const LoadingState = ({ label = 'লোড হচ্ছে…' }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 text-gray-500">
    <Loader2 size={28} className="animate-spin text-[#ba0036]" />
    <p className="text-sm font-semibold">{label}</p>
  </div>
);

export default LoadingState;
