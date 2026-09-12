import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '../ui/Button.jsx';

/**
 * Always offers a retry. On these networks most errors are transient, and a
 * dead end with no button is what makes someone close the app instead of
 * trying again ten seconds later.
 */
const ErrorState = ({ title = 'কিছু একটা সমস্যা হয়েছে', message, onRetry }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-12 px-6 text-center">
    <div className="w-14 h-14 rounded-2xl bg-red-50 flex items-center justify-center text-red-500">
      <AlertTriangle size={26} />
    </div>
    <p className="text-base font-bold text-gray-800">{title}</p>
    {message ? <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{message}</p> : null}
    {onRetry ? (
      <Button size="sm" icon={RefreshCw} onClick={onRetry} className="mt-2">আবার চেষ্টা করুন</Button>
    ) : null}
  </div>
);

export default ErrorState;
