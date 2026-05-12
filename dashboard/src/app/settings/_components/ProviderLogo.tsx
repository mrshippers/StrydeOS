"use client";

interface ProviderLogoProps {
  logo: string;
  logoDark?: string;
  alt: string;
  className?: string;
}

export default function ProviderLogo({ logo, logoDark, alt, className }: ProviderLogoProps) {
  if (logoDark) {
    return (
      <>
        <img src={logo} alt={alt} className={`${className ?? ""} block dark:hidden`} />
        <img src={logoDark} alt={alt} className={`${className ?? ""} hidden dark:block`} />
      </>
    );
  }
  return <img src={logo} alt={alt} className={className} />;
}
