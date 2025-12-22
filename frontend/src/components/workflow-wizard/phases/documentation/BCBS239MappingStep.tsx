/**
 * BCBS239MappingStep Component
 * 
 * Step 3 of Documentation Phase - Display BCBS 239 compliance matrix
 * with principles, evidence links, and compliance status indicators.
 * 
 * Requirements: 10.4
 */

import { useState, useMemo } from 'react'
import {
  CheckCircle,
  AlertCircle,
  XCircle,
  HelpCircle,
  ChevronRight,
  ChevronDown,
  Link,
  FileText,
  Plus,
  Edit,
  ExternalLink,
  Shield,
  BarChart3,
  FileBarChart,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import {
  DocumentArtifact,
  BCBS239ComplianceEntry,
  BCBS239Principle,
  ComplianceStatus,
  EvidenceLink,
  DocumentationSummary,
  BCBS239_PRINCIPLE_CONFIG,
  COMPLIANCE_STATUS_CONFIG,
  getBCBS239CompliancePercentage,
} from './types'

// ============================================================================
// Component Props
// ============================================================================

interface BCBS239MappingStepProps {
  entries: BCBS239ComplianceEntry[]
  artifacts: DocumentArtifact[]
  summary: DocumentationSummary
  onEntryUpdate: (principle: BCBS239Principle, updates: Partial<BCBS239ComplianceEntry>) => void
  onComplete: () => void
}

// ============================================================================
// Sub-Components
// ============================================================================

interface PrincipleCardProps {
  entry: BCBS239ComplianceEntry
  artifacts: DocumentArtifact[]
  isExpanded: boolean
  onToggle: () => void
  onUpdate: (updates: Partial<BCBS239ComplianceEntry>) => void
}

function PrincipleCard({ entry, artifacts, isExpanded, onToggle, onUpdate }: PrincipleCardProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editedEntry, setEditedEntry] = useState(entry)
  const [showAddEvidence, setShowAddEvidence] = useState(false)
  const [newEvidence, setNewEvidence] = useState({
    artifactId: '',
    section: '',
    pageNumber: '',
    description: '',
  })

  const config = BCBS239_PRINCIPLE_CONFIG[entry.principle]
  const statusConfig = COMPLIANCE_STATUS_CONFIG[entry.status]

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'governance':
        return 'bg-purple-100 text-purple-700'
      case 'data_aggregation':
        return 'bg-blue-100 text-blue-700'
      case 'risk_reporting':
        return 'bg-green-100 text-green-700'
      default:
        return 'bg-gray-100 text-gray-700'
    }
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'governance':
        return 'Governance & Infrastructure'
      case 'data_aggregation':
        return 'Data Aggregation'
      case 'risk_reporting':
        return 'Risk Reporting'
      default:
        return category
    }
  }

  const handleSave = () => {
    onUpdate(editedEntry)
    setIsEditing(false)
  }

  const handleAddEvidence = () => {
    if (!newEvidence.artifactId || !newEvidence.description) return

    const artifact = artifacts.find(a => a.id === newEvidence.artifactId)
    if (!artifact) return

    const evidenceLink: EvidenceLink = {
      id: `ev-${Date.now()}`,
      artifactId: newEvidence.artifactId,
      artifactName: artifact.name,
      section: newEvidence.section || undefined,
      pageNumber: newEvidence.pageNumber ? parseInt(newEvidence.pageNumber) : undefined,
      description: newEvidence.description,
    }

    onUpdate({
      evidenceLinks: [...entry.evidenceLinks, evidenceLink],
    })

    setNewEvidence({
      artifactId: '',
      section: '',
      pageNumber: '',
      description: '',
    })
    setShowAddEvidence(false)
  }

  const handleRemoveEvidence = (evidenceId: string) => {
    onUpdate({
      evidenceLinks: entry.evidenceLinks.filter(e => e.id !== evidenceId),
    })
  }

  return (
    <Card className={entry.status === 'non_compliant' ? 'border-red-300' : ''}>
      <CardHeader
        className="cursor-pointer hover:bg-muted/50 transition-colors"
        onClick={onToggle}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {isExpanded ? (
              <ChevronDown className="h-5 w-5 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-5 w-5 text-muted-foreground" />
            )}
            <div className="flex items-center gap-2">
              <span className="text-lg font-bold text-muted-foreground">
                {config.number}.
              </span>
              <span className="font-semibold">{config.name}</span>
            </div>
            <Badge className={getCategoryColor(config.category)}>
              {getCategoryLabel(config.category)}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Badge className={`${statusConfig.bgColor} ${statusConfig.color}`}>
              {entry.status === 'compliant' && <CheckCircle className="h-3 w-3 mr-1" />}
              {entry.status === 'partial' && <AlertCircle className="h-3 w-3 mr-1" />}
              {entry.status === 'non_compliant' && <XCircle className="h-3 w-3 mr-1" />}
              {entry.status === 'not_assessed' && <HelpCircle className="h-3 w-3 mr-1" />}
              {statusConfig.label}
            </Badge>
            <Badge variant="outline">
              <Link className="h-3 w-3 mr-1" />
              {entry.evidenceLinks.length} Evidence
            </Badge>
          </div>
        </div>
      </CardHeader>

      {isExpanded && (
        <CardContent className="pt-0 space-y-4">
          {/* Description */}
          <div className="p-3 bg-muted/50 rounded-lg">
            <p className="text-sm text-muted-foreground">{config.description}</p>
          </div>

          {/* Status & Assessment */}
          {isEditing ? (
            <div className="space-y-4 p-4 border rounded-lg">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Compliance Status</Label>
                  <Select
                    value={editedEntry.status}
                    onValueChange={(value: ComplianceStatus) =>
                      setEditedEntry(prev => ({ ...prev, status: value }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="compliant">Compliant</SelectItem>
                      <SelectItem value="partial">Partially Compliant</SelectItem>
                      <SelectItem value="non_compliant">Non-Compliant</SelectItem>
                      <SelectItem value="not_assessed">Not Assessed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {(editedEntry.status === 'partial' || editedEntry.status === 'non_compliant') && (
                <>
                  <div>
                    <Label>Identified Gaps</Label>
                    <Textarea
                      value={editedEntry.gaps.join('\n')}
                      onChange={(e) =>
                        setEditedEntry(prev => ({
                          ...prev,
                          gaps: e.target.value.split('\n').filter(g => g.trim()),
                        }))
                      }
                      placeholder="Enter each gap on a new line..."
                      className="h-20"
                    />
                  </div>
                  <div>
                    <Label>Remediation Plan</Label>
                    <Textarea
                      value={editedEntry.remediationPlan || ''}
                      onChange={(e) =>
                        setEditedEntry(prev => ({ ...prev, remediationPlan: e.target.value }))
                      }
                      placeholder="Describe the remediation plan..."
                      className="h-20"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Notes</Label>
                <Textarea
                  value={editedEntry.notes || ''}
                  onChange={(e) =>
                    setEditedEntry(prev => ({ ...prev, notes: e.target.value }))
                  }
                  placeholder="Additional notes..."
                  className="h-16"
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setIsEditing(false)}>
                  Cancel
                </Button>
                <Button onClick={handleSave}>Save Assessment</Button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {entry.assessedAt ? (
                  <>
                    Last assessed on {new Date(entry.assessedAt).toLocaleDateString()}
                    {entry.assessedBy && ` by ${entry.assessedBy}`}
                  </>
                ) : (
                  'Not yet assessed'
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                <Edit className="h-4 w-4 mr-1" />
                {entry.status === 'not_assessed' ? 'Assess' : 'Edit Assessment'}
              </Button>
            </div>
          )}

          {/* Gaps */}
          {entry.gaps.length > 0 && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-sm font-medium text-amber-800 mb-2">Identified Gaps:</p>
              <ul className="list-disc list-inside space-y-1">
                {entry.gaps.map((gap, index) => (
                  <li key={index} className="text-sm text-amber-700">{gap}</li>
                ))}
              </ul>
              {entry.remediationPlan && (
                <div className="mt-3 pt-3 border-t border-amber-200">
                  <p className="text-sm font-medium text-amber-800 mb-1">Remediation Plan:</p>
                  <p className="text-sm text-amber-700">{entry.remediationPlan}</p>
                </div>
              )}
            </div>
          )}

          {/* Evidence Links */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Evidence Links</Label>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowAddEvidence(!showAddEvidence)}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Evidence
              </Button>
            </div>

            {showAddEvidence && (
              <Card className="mb-3">
                <CardContent className="p-3 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs">Artifact</Label>
                      <Select
                        value={newEvidence.artifactId}
                        onValueChange={(value) =>
                          setNewEvidence(prev => ({ ...prev, artifactId: value }))
                        }
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="Select artifact..." />
                        </SelectTrigger>
                        <SelectContent>
                          {artifacts.map(artifact => (
                            <SelectItem key={artifact.id} value={artifact.id}>
                              {artifact.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs">Section</Label>
                        <input
                          type="text"
                          value={newEvidence.section}
                          onChange={(e) =>
                            setNewEvidence(prev => ({ ...prev, section: e.target.value }))
                          }
                          placeholder="Section name"
                          className="h-8 w-full px-2 text-sm border rounded-md"
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Page #</Label>
                        <input
                          type="number"
                          value={newEvidence.pageNumber}
                          onChange={(e) =>
                            setNewEvidence(prev => ({ ...prev, pageNumber: e.target.value }))
                          }
                          placeholder="Page"
                          className="h-8 w-full px-2 text-sm border rounded-md"
                        />
                      </div>
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">Description</Label>
                    <Textarea
                      value={newEvidence.description}
                      onChange={(e) =>
                        setNewEvidence(prev => ({ ...prev, description: e.target.value }))
                      }
                      placeholder="Describe how this artifact provides evidence..."
                      className="h-16"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddEvidence(false)}
                    >
                      Cancel
                    </Button>
                    <Button
                      size="sm"
                      onClick={handleAddEvidence}
                      disabled={!newEvidence.artifactId || !newEvidence.description}
                    >
                      Add Evidence
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {entry.evidenceLinks.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">
                No evidence linked yet. Add evidence to support compliance assessment.
              </p>
            ) : (
              <div className="space-y-2">
                {entry.evidenceLinks.map(evidence => (
                  <div
                    key={evidence.id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <p className="text-sm font-medium">{evidence.artifactName}</p>
                        <p className="text-xs text-muted-foreground">
                          {evidence.section && `${evidence.section} • `}
                          {evidence.pageNumber && `Page ${evidence.pageNumber} • `}
                          {evidence.description}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm">
                        <ExternalLink className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveEvidence(evidence.id)}
                      >
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Notes */}
          {entry.notes && (
            <div className="p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium text-muted-foreground mb-1">Notes:</p>
              <p className="text-sm">{entry.notes}</p>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  )
}

// ============================================================================
// Main Component
// ============================================================================

export function BCBS239MappingStep({
  entries,
  artifacts,
  summary,
  onEntryUpdate,
  onComplete,
}: BCBS239MappingStepProps) {
  const [expandedPrinciples, setExpandedPrinciples] = useState<Set<BCBS239Principle>>(new Set())

  const compliancePercentage = useMemo(() => {
    return getBCBS239CompliancePercentage(entries)
  }, [entries])

  const togglePrinciple = (principle: BCBS239Principle) => {
    setExpandedPrinciples(prev => {
      const next = new Set(prev)
      if (next.has(principle)) {
        next.delete(principle)
      } else {
        next.add(principle)
      }
      return next
    })
  }

  const expandAll = () => {
    setExpandedPrinciples(new Set(entries.map(e => e.principle)))
  }

  const collapseAll = () => {
    setExpandedPrinciples(new Set())
  }

  // Group entries by category
  const groupedEntries = useMemo(() => {
    const groups: Record<string, BCBS239ComplianceEntry[]> = {
      governance: [],
      data_aggregation: [],
      risk_reporting: [],
    }
    entries.forEach(entry => {
      const category = BCBS239_PRINCIPLE_CONFIG[entry.principle].category
      groups[category].push(entry)
    })
    return groups
  }, [entries])

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold mb-2">BCBS 239 Compliance Matrix</h2>
        <p className="text-muted-foreground">
          Map documentation artifacts to BCBS 239 principles and assess compliance status.
          Link evidence to support each principle assessment.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg">
                <Shield className="h-5 w-5 text-blue-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{entries.length}</p>
                <p className="text-xs text-muted-foreground">Principles</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-100 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.bcbs239Compliance.compliant}</p>
                <p className="text-xs text-muted-foreground">Compliant</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg">
                <AlertCircle className="h-5 w-5 text-amber-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.bcbs239Compliance.partial}</p>
                <p className="text-xs text-muted-foreground">Partial</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg">
                <XCircle className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.bcbs239Compliance.nonCompliant}</p>
                <p className="text-xs text-muted-foreground">Non-Compliant</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-gray-100 rounded-lg">
                <HelpCircle className="h-5 w-5 text-gray-700" />
              </div>
              <div>
                <p className="text-2xl font-bold">{summary.bcbs239Compliance.notAssessed}</p>
                <p className="text-xs text-muted-foreground">Not Assessed</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Compliance Progress */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-muted-foreground" />
              <span className="font-medium">Overall Compliance</span>
            </div>
            <span className="text-2xl font-bold">{compliancePercentage}%</span>
          </div>
          <Progress value={compliancePercentage} className="h-3" />
          <p className="text-xs text-muted-foreground mt-2">
            {summary.bcbs239Compliance.compliant} of {entries.length} principles fully compliant
          </p>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-end gap-2">
        <Button variant="outline" size="sm" onClick={expandAll}>
          Expand All
        </Button>
        <Button variant="outline" size="sm" onClick={collapseAll}>
          Collapse All
        </Button>
      </div>

      {/* Principles by Category */}
      {Object.entries(groupedEntries).map(([category, categoryEntries]) => (
        <div key={category} className="space-y-3">
          <div className="flex items-center gap-2">
            {category === 'governance' && <Shield className="h-5 w-5 text-purple-600" />}
            {category === 'data_aggregation' && <FileBarChart className="h-5 w-5 text-blue-600" />}
            {category === 'risk_reporting' && <BarChart3 className="h-5 w-5 text-green-600" />}
            <h3 className="font-semibold text-lg">
              {category === 'governance' && 'Governance & Infrastructure'}
              {category === 'data_aggregation' && 'Data Aggregation Capabilities'}
              {category === 'risk_reporting' && 'Risk Reporting Practices'}
            </h3>
            <Badge variant="outline">
              {categoryEntries.filter(e => e.status === 'compliant').length}/{categoryEntries.length} Compliant
            </Badge>
          </div>
          <div className="space-y-3">
            {categoryEntries.map(entry => (
              <PrincipleCard
                key={entry.principle}
                entry={entry}
                artifacts={artifacts}
                isExpanded={expandedPrinciples.has(entry.principle)}
                onToggle={() => togglePrinciple(entry.principle)}
                onUpdate={(updates) => onEntryUpdate(entry.principle, updates)}
              />
            ))}
          </div>
        </div>
      ))}

      {/* Complete Step */}
      <div className="flex justify-end">
        <Button onClick={onComplete}>
          Continue to Package Compilation
          <ChevronRight className="h-4 w-4 ml-2" />
        </Button>
      </div>
    </div>
  )
}

export default BCBS239MappingStep
