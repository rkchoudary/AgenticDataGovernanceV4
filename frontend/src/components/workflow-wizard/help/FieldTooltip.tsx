/**
 * FieldTooltip Component
 * 
 * Displays field description and validation rules on hover.
 * Provides contextual help for form fields in the workflow wizard.
 * 
 * Requirement: 14.3
 */

import { ReactNode } from 'react'
import { HelpCircle, AlertCircle, Info } from 'lucide-react'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { FieldTooltipConfig, ValidationRuleInfo } from './types'
import { getFieldTooltip } from './helpContent'

interface FieldTooltipProps {
  /** Field ID to look up tooltip config, or provide config directly */
  fieldId?: string
  /** Direct tooltip configuration (overrides fieldId lookup) */
  config?: FieldTooltipConfig
  /** Custom trigger element */
  children?: ReactNode
  /** Tooltip position */
  side?: 'top' | 'bottom' | 'left' | 'right'
  /** Additional class name for the trigger */
  className?: string
  /** Show as inline icon next to label */
  inline?: boolean
}

export function FieldTooltip({
  fieldId,
  config: providedConfig,
  children,
  side = 'top',
  className,
  inline = true,
}: FieldTooltipProps) {
  // Get config from fieldId or use provided config
  const config = providedConfig || (fieldId ? getFieldTooltip(fieldId) : null)

  if (!config) {
    return children || null
  }

  const trigger = children || (
    <button
      type="button"
      className={cn(
        'inline-flex items-center justify-center rounded-full',
        'text-muted-foreground hover:text-foreground transition-colors',
        'focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
        inline ? 'h-4 w-4 ml-1' : 'h-5 w-5',
        className
      )}
      aria-label={`Help for ${config.label}`}
    >
      <HelpCircle className={inline ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
    </button>
  )

  return (
    <TooltipProvider>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>{trigger}</TooltipTrigger>
        <TooltipContent side={side} className="max-w-xs p-0">
          <div className="p-3 space-y-2">
            {/* Field Label */}
            <div className="flex items-center gap-2">
              <span className="font-medium text-sm">{config.label}</span>
              {config.required && (
                <span className="text-xs text-destructive">Required</span>
              )}
            </div>

            {/* Description */}
            <p className="text-xs text-muted-foreground">{config.description}</p>

            {/* Validation Rules */}
            {config.validationRules && config.validationRules.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-medium flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  Validation Rules
                </p>
                <ul className="space-y-0.5">
                  {config.validationRules.map((rule, index) => (
                    <ValidationRuleItem key={index} rule={rule} />
                  ))}
                </ul>
              </div>
            )}

            {/* Examples */}
            {config.examples && config.examples.length > 0 && (
              <div className="pt-2 border-t space-y-1">
                <p className="text-xs font-medium flex items-center gap-1">
                  <Info className="h-3 w-3" />
                  Examples
                </p>
                <ul className="space-y-0.5">
                  {config.examples.map((example, index) => (
                    <li
                      key={index}
                      className="text-xs text-muted-foreground pl-3"
                    >
                      • {example}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

/**
 * Validation Rule Item Component
 */
function ValidationRuleItem({ rule }: { rule: ValidationRuleInfo }) {
  const getIcon = () => {
    switch (rule.type) {
      case 'required':
        return '•'
      case 'minLength':
        return '≥'
      case 'maxLength':
        return '≤'
      case 'pattern':
        return '~'
      case 'range':
        return '↔'
      default:
        return '•'
    }
  }

  return (
    <li className="text-xs text-muted-foreground flex items-center gap-1">
      <span className="w-3 text-center">{getIcon()}</span>
      <span>{rule.description}</span>
      {rule.value !== undefined && (
        <span className="text-primary font-mono">({rule.value})</span>
      )}
    </li>
  )
}

/**
 * FieldLabel Component
 * 
 * A label component with integrated tooltip support.
 */
interface FieldLabelProps {
  htmlFor?: string
  label: string
  fieldId?: string
  tooltipConfig?: FieldTooltipConfig
  required?: boolean
  className?: string
}

export function FieldLabel({
  htmlFor,
  label,
  fieldId,
  tooltipConfig,
  required,
  className,
}: FieldLabelProps) {
  const config = tooltipConfig || (fieldId ? getFieldTooltip(fieldId) : null)
  const isRequired = required ?? config?.required

  return (
    <label
      htmlFor={htmlFor}
      className={cn(
        'text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70',
        'flex items-center gap-1',
        className
      )}
    >
      {label}
      {isRequired && <span className="text-destructive">*</span>}
      {config && <FieldTooltip config={config} />}
    </label>
  )
}

export default FieldTooltip
