import { useState } from 'react'
import { 
  Shield, 
  Database, 
  FileCheck, 
  Eye, 
  Settings,
  CheckCircle2,
  ArrowRight,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { useOnboardingStore, type UserRole } from '@/stores/onboardingStore'
import { cn } from '@/lib/utils'

interface RoleInfo {
  id: UserRole
  title: string
  description: string
  icon: React.ElementType
  features: string[]
  quickActions: { label: string; href: string }[]
}

const roleInfoMap: Record<UserRole, RoleInfo> = {
  admin: {
    id: 'admin',
    title: 'Administrator',
    description: 'Full access to all platform features including user management, branding, and system configuration.',
    icon: Settings,
    features: [
      'Manage users and roles',
      'Configure tenant branding',
      'Access all governance features',
      'View audit logs and analytics',
      'Configure notification settings',
    ],
    quickActions: [
      { label: 'Manage Users', href: '/users' },
      { label: 'Configure Branding', href: '/settings/branding' },
      { label: 'View Dashboard', href: '/' },
    ],
  },
  compliance_officer: {
    id: 'compliance_officer',
    title: 'Compliance Officer',
    description: 'Oversee regulatory compliance, approve governance artifacts, and manage report cycles.',
    icon: Shield,
    features: [
      'Approve catalog changes and CDEs',
      'Manage report cycles',
      'Review and resolve issues',
      'Generate compliance reports',
      'Monitor quality metrics',
    ],
    quickActions: [
      { label: 'View Approvals', href: '/approvals' },
      { label: 'Manage Cycles', href: '/cycles' },
      { label: 'View Issues', href: '/issues' },
    ],
  },
  data_steward: {
    id: 'data_steward',
    title: 'Data Steward',
    description: 'Manage data quality rules, maintain CDEs, and ensure data governance standards.',
    icon: Database,
    features: [
      'Define and manage CDEs',
      'Create data quality rules',
      'Map data lineage',
      'Resolve data issues',
      'Document data definitions',
    ],
    quickActions: [
      { label: 'View CDEs', href: '/cdes' },
      { label: 'Explore Lineage', href: '/lineage' },
      { label: 'Manage Issues', href: '/issues' },
    ],
  },
  data_owner: {
    id: 'data_owner',
    title: 'Data Owner',
    description: 'Own and maintain specific data domains, approve changes to owned data elements.',
    icon: FileCheck,
    features: [
      'View owned CDEs',
      'Approve changes to owned data',
      'Monitor quality scores',
      'Review related issues',
      'Provide attestations',
    ],
    quickActions: [
      { label: 'My CDEs', href: '/cdes?owner=me' },
      { label: 'Pending Approvals', href: '/approvals' },
      { label: 'My Issues', href: '/issues?assignee=me' },
    ],
  },
  viewer: {
    id: 'viewer',
    title: 'Viewer',
    description: 'Read-only access to governance data, dashboards, and reports.',
    icon: Eye,
    features: [
      'View dashboards and metrics',
      'Browse CDEs and lineage',
      'Read documentation',
      'View issue status',
      'Access reports',
    ],
    quickActions: [
      { label: 'View Dashboard', href: '/' },
      { label: 'Browse CDEs', href: '/cdes' },
      { label: 'Explore Lineage', href: '/lineage' },
    ],
  },
}

interface RoleWalkthroughProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onComplete?: () => void
}

export function RoleWalkthrough({ open, onOpenChange, onComplete }: RoleWalkthroughProps) {
  const { userRole, setUserRole, startTour } = useOnboardingStore()
  const [selectedRole, setSelectedRole] = useState<UserRole>(userRole)
  const [step, setStep] = useState<'select' | 'overview'>('select')

  const roleInfo = roleInfoMap[selectedRole]

  const handleRoleSelect = (role: UserRole) => {
    setSelectedRole(role)
    setUserRole(role)
    setStep('overview')
  }

  const handleStartTour = () => {
    onOpenChange(false)
    startTour()
    onComplete?.()
  }

  const handleSkip = () => {
    onOpenChange(false)
    onComplete?.()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        {step === 'select' ? (
          <>
            <DialogHeader>
              <DialogTitle>Welcome! What's your role?</DialogTitle>
              <DialogDescription>
                Select your role to get a personalized experience with relevant features and workflows.
              </DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              {Object.values(roleInfoMap).map((role) => {
                const Icon = role.icon
                return (
                  <Card
                    key={role.id}
                    className={cn(
                      'cursor-pointer transition-all hover:border-primary',
                      selectedRole === role.id && 'border-primary bg-primary/5'
                    )}
                    onClick={() => handleRoleSelect(role.id)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex items-center gap-2">
                        <Icon className="h-5 w-5 text-primary" />
                        <CardTitle className="text-base">{role.title}</CardTitle>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {role.description}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="flex items-center gap-2">
                <roleInfo.icon className="h-6 w-6 text-primary" />
                <DialogTitle>{roleInfo.title}</DialogTitle>
              </div>
              <DialogDescription>{roleInfo.description}</DialogDescription>
            </DialogHeader>
            <div className="mt-4 space-y-4">
              <div>
                <h4 className="text-sm font-medium mb-2">Key Features for You</h4>
                <ul className="space-y-2">
                  {roleInfo.features.map((feature, index) => (
                    <li key={index} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
                      {feature}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {roleInfo.quickActions.map((action, index) => (
                    <Button key={index} variant="outline" size="sm" asChild>
                      <a href={action.href}>
                        {action.label}
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </a>
                    </Button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex justify-between mt-6">
              <Button variant="ghost" onClick={() => setStep('select')}>
                Change Role
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={handleSkip}>
                  Skip Tour
                </Button>
                <Button onClick={handleStartTour}>
                  Start Product Tour
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
