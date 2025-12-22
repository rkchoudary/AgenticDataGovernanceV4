import { useBranding } from '@/hooks/useBranding'

interface PlatformBrandingProps {
  className?: string
}

/**
 * Platform branding component that displays "Powered by" text.
 * This component is hidden when tenant has white-label enabled.
 */
export function PlatformBranding({ className }: PlatformBrandingProps) {
  const { data: branding } = useBranding()

  // Hide platform branding if tenant has white-label enabled
  if (branding?.removePlatformBranding) {
    return null
  }

  return (
    <div className={className}>
      <span className="text-xs text-muted-foreground">
        Powered by{' '}
        <a
          href="https://governance.platform"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:underline"
        >
          Data Governance Platform
        </a>
      </span>
    </div>
  )
}

/**
 * Tenant logo component that displays the tenant's custom logo
 * or falls back to the platform logo.
 */
interface TenantLogoProps {
  className?: string
  fallbackText?: string
}

export function TenantLogo({ className, fallbackText = 'DG' }: TenantLogoProps) {
  const { data: branding } = useBranding()

  if (branding?.logoUrl) {
    return (
      <img
        src={branding.logoUrl}
        alt="Logo"
        className={className}
      />
    )
  }

  // Fallback to text-based logo
  return (
    <div
      className={`flex items-center justify-center bg-primary text-primary-foreground font-bold rounded ${className}`}
    >
      {fallbackText}
    </div>
  )
}

export default PlatformBranding
