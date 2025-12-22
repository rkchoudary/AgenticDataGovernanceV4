/**
 * BusinessTermsStep Component
 * 
 * Step 2 of Lineage Mapping phase - Link business glossary terms to lineage nodes.
 * Provides glossary search with auto-suggest based on node metadata.
 * 
 * Requirements: 7.3
 */

import { useState, useMemo, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Database,
  GitBranch,
  Table2,
  FileText,
  Search,
  Link2,
  Unlink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  BookOpen,
  Tag,
  Plus,
  X,
  Clock,
  SkipForward,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import {
  LineageNode,
  BusinessTerm,
  BusinessTermSuggestion,
  LineageMappingSummary,
  LineageNodeType,
  getNodesWithoutBusinessTerms,
  getDeferredNodes,
  nodeHasTermsOrDeferred,
} from './types'

// ============================================================================
// Node Icon Helper
// ============================================================================

const nodeIcons: Record<LineageNodeType, typeof Database> = {
  source_table: Database,
  transformation: GitBranch,
  staging_table: Table2,
  report_field: FileText,
}

// ============================================================================
// Component Props
// ============================================================================

interface BusinessTermsStepProps {
  nodes: LineageNode[]
  businessTerms: BusinessTerm[]
  selectedNodeId: string | null
  onSelectNode: (nodeId: string | null) => void
  onLinkTerm: (nodeId: string, term: BusinessTerm, isAISuggested?: boolean, confidence?: number) => void
  onUnlinkTerm: (nodeId: string, termId: string) => void
  onDeferNode: (nodeId: string, reason?: string) => void
  onUndeferNode: (nodeId: string) => void
  summary: LineageMappingSummary
  onComplete: () => void
}

// ============================================================================
// Main Component
// ============================================================================

export function BusinessTermsStep({
  nodes,
  businessTerms,
  selectedNodeId,
  onSelectNode,
  onLinkTerm,
  onUnlinkTerm,
  onDeferNode,
  onUndeferNode,
  summary,
  onComplete,
}: BusinessTermsStepProps) {
  const [searchQuery, setSearchQuery] = useState('')
  const [showLinkDialog, setShowLinkDialog] = useState(false)
  const [linkingNodeId, setLinkingNodeId] = useState<string | null>(null)

  // Get nodes without business terms (excludes deferred)
  const nodesWithoutTerms = useMemo(() => {
    return getNodesWithoutBusinessTerms(nodes)
  }, [nodes])

  // Get deferred nodes
  const deferredNodes = useMemo(() => {
    return getDeferredNodes(nodes)
  }, [nodes])

  // Get selected node
  const selectedNode = useMemo(() => {
    return nodes.find(n => n.id === selectedNodeId)
  }, [nodes, selectedNodeId])

  // Filter business terms by search
  const filteredTerms = useMemo(() => {
    if (!searchQuery.trim()) return businessTerms
    const query = searchQuery.toLowerCase()
    return businessTerms.filter(term =>
      term.name.toLowerCase().includes(query) ||
      term.definition.toLowerCase().includes(query) ||
      term.synonyms.some(s => s.toLowerCase().includes(query)) ||
      term.category.toLowerCase().includes(query)
    )
  }, [businessTerms, searchQuery])

  // Generate AI suggestions for a node
  const getAISuggestions = useCallback((node: LineageNode): BusinessTermSuggestion[] => {
    const suggestions: BusinessTermSuggestion[] = []
    const nodeLabel = node.label.toLowerCase()
    const nodeDesc = (node.description || '').toLowerCase()
    
    businessTerms.forEach(term => {
      let confidence = 0
      const matchedMetadata: string[] = []
      
      // Check name match
      if (nodeLabel.includes(term.name.toLowerCase())) {
        confidence += 0.4
        matchedMetadata.push('Node name')
      }
      
      // Check synonym match
      term.synonyms.forEach(syn => {
        if (nodeLabel.includes(syn.toLowerCase()) || nodeDesc.includes(syn.toLowerCase())) {
          confidence += 0.3
          matchedMetadata.push(`Synonym: ${syn}`)
        }
      })
      
      // Check description match
      if (nodeDesc.includes(term.name.toLowerCase())) {
        confidence += 0.2
        matchedMetadata.push('Description')
      }
      
      // Check related CDEs
      if (node.relatedCDEs.length > 0) {
        confidence += 0.1
        matchedMetadata.push('Has related CDEs')
      }
      
      if (confidence > 0.2) {
        suggestions.push({
          term,
          confidence: Math.min(confidence, 0.99),
          rationale: `Matched based on: ${matchedMetadata.join(', ')}`,
          matchedMetadata,
        })
      }
    })
    
    return suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5)
  }, [businessTerms])

  // Get suggestions for linking node
  const linkingSuggestions = useMemo(() => {
    if (!linkingNodeId) return []
    const node = nodes.find(n => n.id === linkingNodeId)
    if (!node) return []
    return getAISuggestions(node)
  }, [linkingNodeId, nodes, getAISuggestions])

  // Handle opening link dialog
  const handleOpenLinkDialog = (nodeId: string) => {
    setLinkingNodeId(nodeId)
    setShowLinkDialog(true)
    setSearchQuery('')
  }

  // Handle linking a term
  const handleLinkTerm = (term: BusinessTerm, isAISuggested: boolean = false, confidence?: number) => {
    if (linkingNodeId) {
      onLinkTerm(linkingNodeId, term, isAISuggested, confidence)
    }
  }

  // Progress calculation - includes both linked and deferred nodes
  const nodesHandled = nodes.filter(n => nodeHasTermsOrDeferred(n)).length
  const progress = nodes.length > 0 
    ? Math.round((nodesHandled / nodes.length) * 100)
    : 0

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-semibold">Business Term Linking</h2>
        <p className="text-muted-foreground mt-1">
          Link business glossary terms to lineage nodes to provide business context and improve traceability.
        </p>
      </div>

      {/* Progress Summary */}
      <Card>
        <CardContent className="pt-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium">Linking Progress</span>
            <span className="text-sm text-muted-foreground">
              {summary.nodesWithBusinessTerms} linked, {deferredNodes.length} deferred of {nodes.length} nodes
            </span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className={cn(
                'h-2 rounded-full transition-all',
                progress >= 80 ? 'bg-green-500' : progress >= 50 ? 'bg-amber-500' : 'bg-blue-500'
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs text-muted-foreground">
            <span>{nodesWithoutTerms.length} nodes need terms</span>
            <span>{progress}% complete</span>
          </div>
        </CardContent>
      </Card>

      {/* Main Content */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Nodes List */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Database className="h-5 w-5" />
              Lineage Nodes
            </CardTitle>
            <CardDescription>
              Click on a node to view details or link business terms
            </CardDescription>
          </CardHeader>
          <CardContent className="px-4">
            <ScrollArea className="h-[400px] -mr-4">
              <div className="space-y-2 pr-6">
                {nodes.map(node => {
                  const Icon = nodeIcons[node.type]
                  const hasTerms = node.businessTerms.length > 0
                  const isDeferred = node.businessTermsDeferred === true
                  const isSelected = node.id === selectedNodeId
                  
                  return (
                    <div
                      key={node.id}
                      className={cn(
                        'p-3 rounded-lg border cursor-pointer transition-all',
                        isSelected ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50',
                        !hasTerms && !isDeferred && 'border-amber-200 bg-amber-50/50',
                        isDeferred && 'border-gray-300 bg-gray-50/50'
                      )}
                      onClick={() => onSelectNode(isSelected ? null : node.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2 flex-1 min-w-0">
                          <Icon className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{node.label}</div>
                            <div className="text-xs text-muted-foreground capitalize">
                              {node.type.replace('_', ' ')}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {hasTerms ? (
                            <Badge variant="default" className="text-xs">
                              <Tag className="h-3 w-3 mr-1" />
                              {node.businessTerms.length}
                            </Badge>
                          ) : isDeferred ? (
                            <Badge variant="secondary" className="text-xs text-gray-600 border-gray-300">
                              <Clock className="h-3 w-3 mr-1" />
                              Deferred
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-xs text-amber-600 border-amber-300">
                              No terms
                            </Badge>
                          )}
                          {/* Defer/Undefer button */}
                          {!hasTerms && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              onClick={(e) => {
                                e.stopPropagation()
                                if (isDeferred) {
                                  onUndeferNode(node.id)
                                } else {
                                  onDeferNode(node.id, 'Deferred to future cycle')
                                }
                              }}
                              title={isDeferred ? 'Restore for linking' : 'Defer to future cycle'}
                            >
                              {isDeferred ? (
                                <X className="h-3 w-3 text-gray-500" />
                              ) : (
                                <SkipForward className="h-3 w-3 text-gray-500" />
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Linked Terms */}
                      {hasTerms && (
                        <div className="mt-2 pl-6">
                          <div className="flex flex-wrap gap-1">
                            {node.businessTerms.map(link => (
                              <Badge
                                key={link.termId}
                                variant="secondary"
                                className="text-xs flex items-center gap-1"
                              >
                                {link.isAISuggested && (
                                  <Sparkles className="h-3 w-3 text-purple-500 flex-shrink-0" />
                                )}
                                <span className="truncate max-w-[150px]">{link.termName}</span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation()
                                    onUnlinkTerm(node.id, link.termId)
                                  }}
                                  className="ml-1 hover:text-red-500 flex-shrink-0"
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Deferred reason */}
                      {isDeferred && node.businessTermsDeferredReason && (
                        <div className="mt-2 text-xs text-gray-500 italic pl-6">
                          {node.businessTermsDeferredReason}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Selected Node Details / Term Linking */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <BookOpen className="h-5 w-5" />
              {selectedNode ? 'Node Details' : 'Business Glossary'}
            </CardTitle>
            <CardDescription>
              {selectedNode 
                ? 'View node details and link business terms'
                : 'Select a node to link business terms'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedNode ? (
              <div className="space-y-4">
                {/* Node Info */}
                <div className="p-3 bg-gray-50 rounded-lg">
                  <div className="font-medium">{selectedNode.label}</div>
                  <div className="text-sm text-muted-foreground mt-1">
                    {selectedNode.description || 'No description available'}
                  </div>
                  {selectedNode.owner && (
                    <div className="text-xs text-muted-foreground mt-2">
                      Owner: {selectedNode.owner}
                    </div>
                  )}
                </div>

                {/* Deferred Status */}
                {selectedNode.businessTermsDeferred && (
                  <div className="p-3 bg-gray-100 rounded-lg border border-gray-200">
                    <div className="flex items-center gap-2 text-gray-600">
                      <Clock className="h-4 w-4" />
                      <span className="font-medium text-sm">Deferred to Future Cycle</span>
                    </div>
                    {selectedNode.businessTermsDeferredReason && (
                      <p className="text-xs text-gray-500 mt-1">
                        {selectedNode.businessTermsDeferredReason}
                      </p>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="mt-2"
                      onClick={() => onUndeferNode(selectedNode.id)}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Restore for Linking
                    </Button>
                  </div>
                )}

                {/* AI Suggestions - only show if not deferred */}
                {!selectedNode.businessTermsDeferred && getAISuggestions(selectedNode).length > 0 && (
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <Sparkles className="h-4 w-4 text-purple-500" />
                      <span className="text-sm font-medium">AI Suggestions</span>
                    </div>
                    <div className="space-y-2">
                      {getAISuggestions(selectedNode).slice(0, 3).map(suggestion => (
                        <div
                          key={suggestion.term.id}
                          className="p-2 border rounded-lg flex items-center justify-between"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{suggestion.term.name}</div>
                            <div className="text-xs text-muted-foreground">
                              {Math.round(suggestion.confidence * 100)}% match
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              onLinkTerm(selectedNode.id, suggestion.term, true, suggestion.confidence)
                            }}
                            disabled={selectedNode.businessTerms.some(t => t.termId === suggestion.term.id)}
                          >
                            <Link2 className="h-4 w-4 mr-1" />
                            Link
                          </Button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {!selectedNode.businessTermsDeferred && <Separator />}

                {/* Manual Link Button - only show if not deferred */}
                {!selectedNode.businessTermsDeferred && (
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      variant="outline"
                      onClick={() => handleOpenLinkDialog(selectedNode.id)}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Link Business Term
                    </Button>
                    {selectedNode.businessTerms.length === 0 && (
                      <Button
                        variant="ghost"
                        onClick={() => onDeferNode(selectedNode.id, 'Deferred to future cycle')}
                        title="Defer to future cycle"
                      >
                        <SkipForward className="h-4 w-4 mr-1" />
                        Defer
                      </Button>
                    )}
                  </div>
                )}

                {/* Current Links */}
                {selectedNode.businessTerms.length > 0 && (
                  <div>
                    <div className="text-sm font-medium mb-2">Linked Terms</div>
                    <div className="space-y-2">
                      {selectedNode.businessTerms.map(link => {
                        const term = businessTerms.find(t => t.id === link.termId)
                        return (
                          <div
                            key={link.termId}
                            className="p-2 border rounded-lg flex items-start justify-between"
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-sm">{link.termName}</span>
                                {link.isAISuggested && (
                                  <Sparkles className="h-3 w-3 text-purple-500" />
                                )}
                              </div>
                              {term && (
                                <div className="text-xs text-muted-foreground mt-1">
                                  {term.definition}
                                </div>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => onUnlinkTerm(selectedNode.id, link.termId)}
                            >
                              <Unlink className="h-4 w-4" />
                            </Button>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <BookOpen className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Select a node from the list to view details and link business terms</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Link Dialog */}
      <Dialog open={showLinkDialog} onOpenChange={setShowLinkDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Link Business Term</DialogTitle>
            <DialogDescription>
              Search and select a business term to link to this node
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search terms..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>

            {/* AI Suggestions */}
            {linkingSuggestions.length > 0 && !searchQuery && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles className="h-4 w-4 text-purple-500" />
                  <span className="text-sm font-medium">Suggested Terms</span>
                </div>
                <div className="space-y-2">
                  {linkingSuggestions.map(suggestion => (
                    <div
                      key={suggestion.term.id}
                      className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                      onClick={() => {
                        handleLinkTerm(suggestion.term, true, suggestion.confidence)
                        setShowLinkDialog(false)
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{suggestion.term.name}</span>
                        <Badge variant="secondary">
                          {Math.round(suggestion.confidence * 100)}% match
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {suggestion.term.definition}
                      </p>
                    </div>
                  ))}
                </div>
                <Separator className="my-4" />
              </div>
            )}

            {/* All Terms */}
            <ScrollArea className="h-[300px]">
              <div className="space-y-2">
                {filteredTerms.map(term => (
                  <div
                    key={term.id}
                    className="p-3 border rounded-lg hover:bg-gray-50 cursor-pointer"
                    onClick={() => {
                      handleLinkTerm(term)
                      setShowLinkDialog(false)
                    }}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium">{term.name}</span>
                      <Badge variant="outline">{term.category}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      {term.definition}
                    </p>
                    {term.synonyms.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {term.synonyms.map(syn => (
                          <Badge key={syn} variant="secondary" className="text-xs">
                            {syn}
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
                {filteredTerms.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No terms found matching "{searchQuery}"
                  </div>
                )}
              </div>
            </ScrollArea>
          </div>
        </DialogContent>
      </Dialog>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4 border-t">
        <div className="text-sm text-muted-foreground">
          {nodesWithoutTerms.length === 0 ? (
            <span className="text-green-600 flex items-center gap-1">
              <CheckCircle2 className="h-4 w-4" />
              All nodes have business terms linked or deferred
            </span>
          ) : (
            <span className="text-amber-600 flex items-center gap-1">
              <AlertCircle className="h-4 w-4" />
              {nodesWithoutTerms.length} node(s) without business terms
              {deferredNodes.length > 0 && ` (${deferredNodes.length} deferred)`}
            </span>
          )}
        </div>
        <div className="flex gap-2">
          {nodesWithoutTerms.length > 0 && (
            <Button
              variant="outline"
              onClick={() => {
                // Defer all remaining nodes without terms
                nodesWithoutTerms.forEach(node => {
                  onDeferNode(node.id, 'Deferred to future cycle')
                })
                onComplete()
              }}
            >
              <SkipForward className="h-4 w-4 mr-2" />
              Defer All & Continue
            </Button>
          )}
          <Button onClick={onComplete}>
            Continue to Impact Analysis
          </Button>
        </div>
      </div>
    </div>
  )
}

export default BusinessTermsStep
