import { useState } from 'react'
import {
  Globe,
  Mail,
  Shield,
  CheckCircle2,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'

interface WhiteLabelConfigProps {
  customDomain?: string
  customEmailSender?: string
  removePlatformBranding: boolean
  onCustomDomainChange: (value: string) => void
  onCustomEmailSenderChange: (value: string) => void
  onRemovePlatformBrandingChange: (value: boolean) => void
}

interface DomainVerificationStatus {
  verified: boolean
  dnsRecords: {
    type: string
    name: string
    value: string
    verified: boolean
  }[]
}

// Mock verification status - in production this would come from the API
const mockVerificationStatus: DomainVerificationStatus = {
  verified: false,
  dnsRecords: [
    {
      type: 'CNAME',
      name: 'governance',
      value: 'custom.governance.platform',
      verified: false,
    },
    {
      type: 'TXT',
      name: '_verification',
      value: 'governance-verify=abc123xyz',
      verified: false,
    },
  ],
}

export function WhiteLabelConfig({
  customDomain,
  customEmailSender,
  removePlatformBranding,
  onCustomDomainChange,
  onCustomEmailSenderChange,
  onRemovePlatformBrandingChange,
}: WhiteLabelConfigProps) {
  const [copiedField, setCopiedField] = useState<string | null>(null)
  const [verificationStatus] = useState<DomainVerificationStatus>(mockVerificationStatus)

  const copyToClipboard = async (text: string, field: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedField(field)
    setTimeout(() => setCopiedField(null), 2000)
  }

  return (
    <div className="space-y-6">
      {/* Custom Domain Configuration */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Globe className="h-5 w-5" />
            Custom Domain
          </CardTitle>
          <CardDescription>
            Use your own domain to access the platform (e.g., governance.yourcompany.com)
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Domain Name</label>
            <input
              type="text"
              value={customDomain || ''}
              onChange={(e) => onCustomDomainChange(e.target.value)}
              placeholder="governance.yourcompany.com"
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
          </div>

          {customDomain && (
            <>
              <Separator />
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">DNS Configuration</h4>
                  <span
                    className={cn(
                      'text-xs px-2 py-1 rounded-full',
                      verificationStatus.verified
                        ? 'bg-green-100 text-green-700'
                        : 'bg-yellow-100 text-yellow-700'
                    )}
                  >
                    {verificationStatus.verified ? 'Verified' : 'Pending Verification'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground">
                  Add the following DNS records to your domain provider:
                </p>
                <div className="space-y-2">
                  {verificationStatus.dnsRecords.map((record, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 bg-muted rounded-lg"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono bg-background px-2 py-0.5 rounded">
                            {record.type}
                          </span>
                          <span className="text-sm font-medium">{record.name}</span>
                          {record.verified ? (
                            <CheckCircle2 className="h-4 w-4 text-green-500" />
                          ) : (
                            <AlertCircle className="h-4 w-4 text-yellow-500" />
                          )}
                        </div>
                        <p className="text-xs font-mono text-muted-foreground truncate max-w-md">
                          {record.value}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(record.value, `dns-${index}`)}
                      >
                        {copiedField === `dns-${index}` ? (
                          <Check className="h-4 w-4 text-green-500" />
                        ) : (
                          <Copy className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  ))}
                </div>
                <Button variant="outline" size="sm" className="w-full">
                  <ExternalLink className="h-4 w-4 mr-2" />
                  View DNS Setup Guide
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Custom Email Sender */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Custom Email Sender
          </CardTitle>
          <CardDescription>
            Send notifications from your own email address instead of the platform default
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Sender Email Address</label>
            <input
              type="email"
              value={customEmailSender || ''}
              onChange={(e) => onCustomEmailSenderChange(e.target.value)}
              placeholder="notifications@yourcompany.com"
              className="w-full px-3 py-2 border rounded-md bg-background"
            />
            <p className="text-xs text-muted-foreground">
              You'll need to verify this email address before it can be used.
            </p>
          </div>

          {customEmailSender && (
            <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
              <AlertCircle className="h-4 w-4 text-yellow-600" />
              <span className="text-sm text-yellow-800">
                Verification email sent. Please check your inbox.
              </span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Platform Branding Removal */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5" />
            Platform Branding
          </CardTitle>
          <CardDescription>
            Control the visibility of platform branding elements
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <label className="text-sm font-medium">Remove Platform Branding</label>
              <p className="text-xs text-muted-foreground">
                Hide "Powered by" text, platform logos, and other branding elements
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={removePlatformBranding}
              onClick={() => onRemovePlatformBrandingChange(!removePlatformBranding)}
              className={cn(
                'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                removePlatformBranding ? 'bg-primary' : 'bg-muted'
              )}
            >
              <span
                className={cn(
                  'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                  removePlatformBranding ? 'translate-x-6' : 'translate-x-1'
                )}
              />
            </button>
          </div>

          <Separator />

          <div className="space-y-2">
            <p className="text-sm font-medium">What gets hidden:</p>
            <ul className="text-xs text-muted-foreground space-y-1">
              <li className="flex items-center gap-2">
                <span className={removePlatformBranding ? 'line-through' : ''}>
                  • "Powered by Data Governance Platform" footer text
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className={removePlatformBranding ? 'line-through' : ''}>
                  • Platform logo in email templates
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className={removePlatformBranding ? 'line-through' : ''}>
                  • Platform branding in exported documents
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className={removePlatformBranding ? 'line-through' : ''}>
                  • Help center links to platform documentation
                </span>
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

export default WhiteLabelConfig
