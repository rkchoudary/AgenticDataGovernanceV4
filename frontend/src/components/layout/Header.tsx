import { Menu, Search, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useAuthStore, useUIStore } from '@/stores'
import { NotificationCenter } from '@/components/notifications'
import { cn } from '@/lib/utils'

export function Header() {
  const { user } = useAuthStore()
  const { toggleMobileNav, toggleChatPanel, chatPanelOpen } = useUIStore()

  const initials = user?.name
    ?.split(' ')
    .map((n) => n[0])
    .join('')
    .toUpperCase() || 'U'

  return (
    <header className="sticky top-0 z-50 flex h-16 items-center gap-4 border-b bg-background px-4 md:px-6">
      {/* Mobile menu button */}
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={toggleMobileNav}
      >
        <Menu className="h-5 w-5" />
        <span className="sr-only">Toggle menu</span>
      </Button>

      {/* Search */}
      <div className="flex-1">
        <div className="relative max-w-md">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <input
            type="search"
            placeholder="Search..."
            className="w-full rounded-md border border-input bg-background py-2 pl-8 pr-4 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        {/* AI Chat */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button 
              variant={chatPanelOpen ? "default" : "outline"} 
              size="sm" 
              className={cn(
                "relative transition-all duration-200",
                chatPanelOpen 
                  ? "bg-primary text-primary-foreground shadow-md" 
                  : "border-primary/20 text-primary hover:bg-primary/5"
              )}
              onClick={toggleChatPanel}
            >
              <MessageSquare className="h-4 w-4 mr-2" />
              AI Assistant
              {chatPanelOpen && (
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-green-500 rounded-full animate-pulse" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <p>Open AI Assistant (⌘K)</p>
          </TooltipContent>
        </Tooltip>

        {/* Notifications */}
        <NotificationCenter />

        {/* User menu */}
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src={user?.avatarUrl} alt={user?.name || 'User'} />
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </div>
    </header>
  )
}
