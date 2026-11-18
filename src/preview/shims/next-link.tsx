import type { AnchorHTMLAttributes, MouseEvent, ReactNode } from 'react';

export default function Link({
  href,
  children,
  onClick,
  ...rest
}: {
  href: string;
  children?: ReactNode;
  onClick?: (event: MouseEvent<HTMLAnchorElement>) => void;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick' | 'children'>) {
  return (
    <a
      href={href}
      {...rest}
      onClick={event => {
        onClick?.(event);
        if (event.defaultPrevented || href.startsWith('/')) {
          event.preventDefault();
        }
      }}
    >
      {children}
    </a>
  );
}
