/**
 * Collapsible Component
 * 
 * A component that can be expanded or collapsed to show/hide content.
 * Based on Radix UI Collapsible primitive.
 */

import * as React from 'react'
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible'

const Collapsible = CollapsiblePrimitive.Root

const CollapsibleTrigger = CollapsiblePrimitive.CollapsibleTrigger

const CollapsibleContent = React.forwardRef<
  React.ElementRef<typeof CollapsiblePrimitive.CollapsibleContent>,
  React.ComponentPropsWithoutRef<typeof CollapsiblePrimitive.CollapsibleContent>
>(({ className, children, ...props }, ref) => (
  <CollapsiblePrimitive.CollapsibleContent
    ref={ref}
    className={className}
    {...props}
  >
    {children}
  </CollapsiblePrimitive.CollapsibleContent>
))
CollapsibleContent.displayName = CollapsiblePrimitive.CollapsibleContent.displayName

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
