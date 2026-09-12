import React from 'react';

/**
 * An empty list must always say what to DO next, never just that it is empty.
 * "কোনো অর্ডার নেই" on its own reads as "this app is broken"; the same screen
 * with "আপনি খোলা আছেন — অর্ডার এলে এখানে দেখাবে" reads as working and waiting.
 */
const EmptyState = ({ icon: Icon, title, hint, action }) => (
  <div className="flex flex-col items-center justify-center gap-3 py-14 px-6 text-center">
    {Icon ? (
      <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center text-gray-400">
        <Icon size={26} />
      </div>
    ) : null}
    <p className="text-base font-bold text-gray-800">{title}</p>
    {hint ? <p className="text-sm text-gray-500 max-w-xs leading-relaxed">{hint}</p> : null}
    {action ? <div className="mt-2">{action}</div> : null}
  </div>
);

export default EmptyState;
