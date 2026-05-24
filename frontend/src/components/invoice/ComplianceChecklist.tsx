import { CheckCircle, Circle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CheckItem {
  id: string;
  label: string;
  complete: boolean;
}

interface ComplianceChecklistProps {
  items: CheckItem[];
}

export function ComplianceChecklist({ items }: ComplianceChecklistProps) {
  const allComplete = items.every((i) => i.complete);
  const completeCount = items.filter((i) => i.complete).length;

  return (
    <div className={cn(
      'rounded-xl border p-4 mb-5 transition-colors',
      allComplete ? 'border-brand-200 bg-brand-50/50' : 'border-amber-200 bg-amber-50/40',
    )}>
      <div className="flex items-center justify-between mb-3">
        <p className={cn('text-sm font-semibold', allComplete ? 'text-brand-700' : 'text-amber-700')}>
          ✓ NDIS Compliance Checklist
        </p>
        <span className={cn(
          'text-xs font-medium px-2 py-0.5 rounded-full',
          allComplete ? 'bg-brand-100 text-brand-700' : 'bg-amber-100 text-amber-700',
        )}>
          {completeCount}/{items.length}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        {items.map((item) => (
          <div key={item.id} className="flex items-center gap-2.5">
            {item.complete ? (
              <CheckCircle className="w-4 h-4 text-brand-500 flex-shrink-0" />
            ) : (
              <Circle className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            )}
            <span className={cn('text-xs', item.complete ? 'text-brand-700' : 'text-muted-foreground')}>
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
