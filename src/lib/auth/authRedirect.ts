export const getAuthRedirectUrl = () => {
  if (typeof window === "undefined") return undefined;
  return `${window.location.origin}${window.location.pathname}`;
};

