export function useRouter() {
  return {
    refresh() {},
    push() {},
    replace() {},
    back() {},
    prefetch() {},
  };
}

export function usePathname(): string {
  return '/listen';
}

export function useSearchParams(): URLSearchParams {
  return new URLSearchParams();
}

export function useParams(): Record<string, string | string[]> {
  return {};
}

export function redirect(): void {}

export function notFound(): void {}
