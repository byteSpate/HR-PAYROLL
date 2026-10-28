'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { RemixiconComponentType } from '@remixicon/react';
import { Button, buttonVariants } from '../components/button';
import { cn } from '../lib/cn';

const CTA_CLASSES =
  'h-auto shrink-0 rounded-md bg-rail-from px-4 py-2.5 text-[13px] font-bold text-white transition-transform hover:bg-[#0E1012] active:translate-y-px motion-reduce:transition-none';

export function PageHeader({
  kicker,
  title,
  sub,
  cta,
  ctaHref,
  onCta,
  ctaIcon: CtaIcon,
  aside,
}: {
  kicker: string;
  title: string;
  sub?: string;
  /** The button's words. With neither `ctaHref` nor `onCta` there is no button. */
  cta?: string;
  /** ERP actions are real routes, so this renders a link styled as the button. */
  ctaHref?: string;
  onCta?: () => void;
  ctaIcon?: RemixiconComponentType;
  /** A control that belongs to the whole page, such as the attendance month stepper. Sits beside the button. */
  aside?: ReactNode;
}) {
  const icon = CtaIcon ? <CtaIcon className="size-4" aria-hidden /> : null;
  const button =
    cta && ctaHref ? (
      <Link href={ctaHref} className={cn(buttonVariants(), CTA_CLASSES)}>
        {icon}
        {cta}
      </Link>
    ) : cta && onCta ? (
      <Button onClick={onCta} className={CTA_CLASSES}>
        {icon}
        {cta}
      </Button>
    ) : null;

  return (
    <div className="flex flex-wrap items-start justify-between gap-4 pt-5 pb-4 sm:items-end sm:pt-7 sm:pb-5.5">
      <div>
        <div className="mb-1.5 text-[11.5px] font-bold tracking-[1.1px] text-slate uppercase">{kicker}</div>
        <h1 className="mb-1 font-heading text-[20px] font-bold tracking-tight sm:text-[23px]">{title}</h1>
        {sub ? <div className="text-[13px] text-slate">{sub}</div> : null}
      </div>
      {aside || button ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {aside}
          {button}
        </div>
      ) : null}
    </div>
  );
}
