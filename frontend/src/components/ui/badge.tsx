import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground',
        secondary: 'border-transparent bg-secondary text-secondary-foreground',
        destructive: 'border-transparent bg-destructive text-destructive-foreground',
        outline: 'text-foreground',
        draft: 'border-transparent bg-gray-100 text-gray-600',
        sent: 'border-transparent bg-blue-50 text-blue-700',
        paid: 'border-transparent bg-emerald-50 text-emerald-700',
        void: 'border-transparent bg-gray-100 text-gray-500',
        overdue: 'border-transparent bg-red-50 text-red-700',
        invoice: 'border-transparent bg-brand-50 text-brand-700',
        quote: 'border-transparent bg-violet-50 text-violet-700',
        po: 'border-transparent bg-orange-50 text-orange-700',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
