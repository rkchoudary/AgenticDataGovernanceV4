import { useState, useRef } from 'react'
import {
  Mail,
  Upload,
  Users,
  Key,
  AlertCircle,
  CheckCircle2,
  FileSpreadsheet,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { useInviteUser, useBulkImportUsers, type UserRole, type BulkImportResult } from '@/hooks/useUsers'
import { cn } from '@/lib/utils'

interface InviteUserDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const roleOptions: Array<{ value: UserRole; label: string; description: string }> = [
  { value: 'admin', label: 'Admin', description: 'Full system access' },
  { value: 'compliance_officer', label: 'Compliance Officer', description: 'Approve artifacts and manage compliance' },
  { value: 'data_steward', label: 'Data Steward', description: 'Manage CDEs and data quality' },
  { value: 'data_owner', label: 'Data Owner', description: 'Own and approve data elements' },
  { value: 'viewer', label: 'Viewer', description: 'Read-only access' },
]

export function InviteUserDialog({ open, onOpenChange }: InviteUserDialogProps) {
  const [activeTab, setActiveTab] = useState('email')
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<UserRole>('viewer')
  const [department, setDepartment] = useState('')
  const [message, setMessage] = useState('')
  const [bulkResult, setBulkResult] = useState<BulkImportResult | null>(null)
  const [ssoEnabled, setSsoEnabled] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const inviteUser = useInviteUser()
  const bulkImport = useBulkImportUsers()

  const handleEmailInvite = async () => {
    if (!email) return
    
    await inviteUser.mutateAsync({
      email,
      role,
      department: department || undefined,
      message: message || undefined,
    })
    
    // Reset form
    setEmail('')
    setRole('viewer')
    setDepartment('')
    setMessage('')
    onOpenChange(false)
  }

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    const result = await bulkImport.mutateAsync(file)
    setBulkResult(result)
  }

  const handleClose = () => {
    setEmail('')
    setRole('viewer')
    setDepartment('')
    setMessage('')
    setBulkResult(null)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Invite Users</DialogTitle>
          <DialogDescription>
            Add new users to your organization
          </DialogDescription>
        </DialogHeader>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="email" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              Email
            </TabsTrigger>
            <TabsTrigger value="bulk" className="flex items-center gap-2">
              <Upload className="h-4 w-4" />
              Bulk Import
            </TabsTrigger>
            <TabsTrigger value="sso" className="flex items-center gap-2">
              <Key className="h-4 w-4" />
              SSO
            </TabsTrigger>
          </TabsList>


          {/* Email Invitation Tab */}
          <TabsContent value="email" className="space-y-4 mt-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Email Address</label>
              <input
                type="email"
                placeholder="user@company.com"
                className="w-full px-3 py-2 border rounded-md bg-background"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Role</label>
              <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a role" />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      <div className="flex flex-col">
                        <span>{option.label}</span>
                        <span className="text-xs text-muted-foreground">{option.description}</span>
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Department (Optional)</label>
              <input
                type="text"
                placeholder="e.g., Finance, Compliance"
                className="w-full px-3 py-2 border rounded-md bg-background"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Personal Message (Optional)</label>
              <textarea
                placeholder="Add a personal message to the invitation email..."
                className="w-full px-3 py-2 border rounded-md bg-background min-h-[80px]"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
              />
            </div>
          </TabsContent>

          {/* Bulk Import Tab */}
          <TabsContent value="bulk" className="space-y-4 mt-4">
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-sm text-muted-foreground mb-4">
                Upload a CSV file with user information
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileUpload}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={bulkImport.isPending}
              >
                <Upload className="h-4 w-4 mr-2" />
                {bulkImport.isPending ? 'Uploading...' : 'Select CSV File'}
              </Button>
            </div>

            <div className="bg-muted/50 rounded-lg p-4">
              <p className="text-sm font-medium mb-2">CSV Format Requirements:</p>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• Column headers: email, name, role, department</li>
                <li>• Valid roles: admin, compliance_officer, data_steward, data_owner, viewer</li>
                <li>• Maximum 100 users per import</li>
              </ul>
              <Button variant="link" className="p-0 h-auto mt-2 text-sm">
                Download template CSV
              </Button>
            </div>

            {bulkResult && (
              <div className={cn(
                'rounded-lg p-4',
                bulkResult.failed > 0 ? 'bg-yellow-50 border border-yellow-200' : 'bg-green-50 border border-green-200'
              )}>
                <div className="flex items-start gap-3">
                  {bulkResult.failed > 0 ? (
                    <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  ) : (
                    <CheckCircle2 className="h-5 w-5 text-green-600 mt-0.5" />
                  )}
                  <div>
                    <p className="font-medium">
                      Import Complete: {bulkResult.successful} of {bulkResult.total} users added
                    </p>
                    {bulkResult.errors.length > 0 && (
                      <div className="mt-2 text-sm">
                        <p className="text-muted-foreground mb-1">Errors:</p>
                        <ul className="space-y-1">
                          {bulkResult.errors.map((err, i) => (
                            <li key={i} className="text-red-600">
                              {err.email}: {err.error}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </TabsContent>

          {/* SSO Tab */}
          <TabsContent value="sso" className="space-y-4 mt-4">
            <div className="bg-muted/50 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <Key className="h-5 w-5 text-muted-foreground mt-0.5" />
                <div>
                  <p className="font-medium">SSO Auto-Provisioning</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    When enabled, users from your identity provider will be automatically 
                    provisioned when they first sign in.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex items-center gap-3">
                  <Users className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium">Enable Auto-Provisioning</p>
                    <p className="text-sm text-muted-foreground">
                      New SSO users get the default role automatically
                    </p>
                  </div>
                </div>
                <button
                  className={cn(
                    'relative inline-flex h-6 w-11 items-center rounded-full transition-colors',
                    ssoEnabled ? 'bg-primary' : 'bg-gray-200'
                  )}
                  onClick={() => setSsoEnabled(!ssoEnabled)}
                >
                  <span
                    className={cn(
                      'inline-block h-4 w-4 transform rounded-full bg-white transition-transform',
                      ssoEnabled ? 'translate-x-6' : 'translate-x-1'
                    )}
                  />
                </button>
              </div>

              {ssoEnabled && (
                <div className="space-y-2">
                  <label className="text-sm font-medium">Default Role for SSO Users</label>
                  <Select value={role} onValueChange={(v) => setRole(v as UserRole)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select default role" />
                    </SelectTrigger>
                    <SelectContent>
                      {roleOptions.map((option) => (
                        <SelectItem key={option.value} value={option.value}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              <div className="text-sm text-muted-foreground">
                <p>Supported identity providers:</p>
                <ul className="mt-2 space-y-1">
                  <li>• Microsoft Entra ID (Azure AD)</li>
                  <li>• Okta</li>
                  <li>• AWS IAM Identity Center</li>
                  <li>• Google Workspace</li>
                </ul>
              </div>
            </div>
          </TabsContent>
        </Tabs>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          {activeTab === 'email' && (
            <Button 
              onClick={handleEmailInvite} 
              disabled={!email || inviteUser.isPending}
            >
              {inviteUser.isPending ? 'Sending...' : 'Send Invitation'}
            </Button>
          )}
          {activeTab === 'sso' && ssoEnabled && (
            <Button onClick={handleClose}>
              Save Settings
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export default InviteUserDialog
