import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Settings } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DelegationSettings } from '@/components/approvals/DelegationSettings'
import { RoutingRulesManager } from '@/components/approvals/RoutingRulesManager'

export function ApprovalSettings() {
  const navigate = useNavigate()

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => navigate('/approvals')}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Settings className="h-6 w-6" />
            Approval Settings
          </h1>
          <p className="text-muted-foreground">
            Configure delegation and routing rules for approvals
          </p>
        </div>
      </div>

      {/* Delegation Settings */}
      <DelegationSettings />

      {/* Routing Rules */}
      <RoutingRulesManager />
    </div>
  )
}

export default ApprovalSettings
