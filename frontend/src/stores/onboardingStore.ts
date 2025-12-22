import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type UserRole = 'admin' | 'compliance_officer' | 'data_steward' | 'data_owner' | 'viewer'

export interface TourStep {
  id: string
  target: string
  title: string
  content: string
  placement?: 'top' | 'bottom' | 'left' | 'right'
  spotlightPadding?: number
  disableBeacon?: boolean
  roles?: UserRole[]
}

export interface OnboardingState {
  // Tour state
  tourActive: boolean
  tourCompleted: boolean
  currentTourStep: number
  tourSteps: TourStep[]
  
  // User role for role-specific tours
  userRole: UserRole
  
  // Feature discovery
  discoveredFeatures: string[]
  
  // Wizard state
  activeWizard: string | null
  wizardStep: number
  wizardData: Record<string, unknown>
  
  // Help center
  helpCenterOpen: boolean
  
  // Actions
  startTour: () => void
  endTour: () => void
  completeTour: () => void
  nextTourStep: () => void
  prevTourStep: () => void
  goToTourStep: (step: number) => void
  setUserRole: (role: UserRole) => void
  discoverFeature: (featureId: string) => void
  startWizard: (wizardId: string) => void
  endWizard: () => void
  nextWizardStep: () => void
  prevWizardStep: () => void
  setWizardData: (data: Record<string, unknown>) => void
  resetWizard: () => void
  toggleHelpCenter: () => void
  setHelpCenterOpen: (open: boolean) => void
  resetOnboarding: () => void
}

// Default tour steps for the product tour
const defaultTourSteps: TourStep[] = [
  {
    id: 'welcome',
    target: '[data-tour="dashboard"]',
    title: 'Welcome to Data Governance',
    content: 'This is your central hub for managing data governance across your organization. Let\'s take a quick tour!',
    placement: 'bottom',
    disableBeacon: true,
  },
  {
    id: 'dashboard-kpis',
    target: '[data-tour="kpi-cards"]',
    title: 'Key Performance Indicators',
    content: 'Monitor your compliance score, active cycles, open issues, and pending approvals at a glance.',
    placement: 'bottom',
  },
  {
    id: 'report-cycles',
    target: '[data-tour="nav-cycles"]',
    title: 'Report Cycles',
    content: 'Track and manage regulatory reporting cycles through all phases from data gathering to submission.',
    placement: 'right',
    roles: ['admin', 'compliance_officer', 'data_steward'],
  },
  {
    id: 'cdes',
    target: '[data-tour="nav-cdes"]',
    title: 'Critical Data Elements',
    content: 'View and manage your Critical Data Elements (CDEs) with quality scores and ownership information.',
    placement: 'right',
    roles: ['admin', 'compliance_officer', 'data_steward', 'data_owner'],
  },
  {
    id: 'issues',
    target: '[data-tour="nav-issues"]',
    title: 'Issue Management',
    content: 'Track data quality issues, assign owners, and monitor resolution progress.',
    placement: 'right',
  },
  {
    id: 'approvals',
    target: '[data-tour="nav-approvals"]',
    title: 'Approvals',
    content: 'Review and approve governance artifacts, catalog changes, and workflow decisions.',
    placement: 'right',
    roles: ['admin', 'compliance_officer'],
  },
  {
    id: 'lineage',
    target: '[data-tour="nav-lineage"]',
    title: 'Data Lineage',
    content: 'Visualize data flows from source systems through transformations to regulatory reports.',
    placement: 'right',
    roles: ['admin', 'compliance_officer', 'data_steward'],
  },
  {
    id: 'ai-assistant',
    target: '[data-tour="chat-panel"]',
    title: 'AI Assistant',
    content: 'Get help from our AI-powered assistant. Ask questions about your data, get recommendations, and perform actions through natural language.',
    placement: 'left',
  },
  {
    id: 'help',
    target: '[data-tour="help-button"]',
    title: 'Need Help?',
    content: 'Access contextual help, documentation, and support resources anytime. You can restart this tour from the help menu.',
    placement: 'top',
  },
]

export const useOnboardingStore = create<OnboardingState>()(
  persist(
    (set, get) => ({
      // Initial state
      tourActive: false,
      tourCompleted: false,
      currentTourStep: 0,
      tourSteps: defaultTourSteps,
      userRole: 'viewer',
      discoveredFeatures: [],
      activeWizard: null,
      wizardStep: 0,
      wizardData: {},
      helpCenterOpen: false,

      // Tour actions
      startTour: () => set({ tourActive: true, currentTourStep: 0 }),
      
      endTour: () => set({ tourActive: false }),
      
      completeTour: () => set({ tourActive: false, tourCompleted: true }),
      
      nextTourStep: () => {
        const { currentTourStep, tourSteps, userRole } = get()
        const filteredSteps = tourSteps.filter(
          step => !step.roles || step.roles.includes(userRole)
        )
        if (currentTourStep < filteredSteps.length - 1) {
          set({ currentTourStep: currentTourStep + 1 })
        } else {
          get().completeTour()
        }
      },
      
      prevTourStep: () => {
        const { currentTourStep } = get()
        if (currentTourStep > 0) {
          set({ currentTourStep: currentTourStep - 1 })
        }
      },
      
      goToTourStep: (step) => set({ currentTourStep: step }),
      
      setUserRole: (role) => set({ userRole: role }),
      
      discoverFeature: (featureId) => {
        const { discoveredFeatures } = get()
        if (!discoveredFeatures.includes(featureId)) {
          set({ discoveredFeatures: [...discoveredFeatures, featureId] })
        }
      },

      // Wizard actions
      startWizard: (wizardId) => set({ 
        activeWizard: wizardId, 
        wizardStep: 0, 
        wizardData: {} 
      }),
      
      endWizard: () => set({ 
        activeWizard: null, 
        wizardStep: 0, 
        wizardData: {} 
      }),
      
      nextWizardStep: () => {
        const { wizardStep } = get()
        set({ wizardStep: wizardStep + 1 })
      },
      
      prevWizardStep: () => {
        const { wizardStep } = get()
        if (wizardStep > 0) {
          set({ wizardStep: wizardStep - 1 })
        }
      },
      
      setWizardData: (data) => {
        const { wizardData } = get()
        set({ wizardData: { ...wizardData, ...data } })
      },
      
      resetWizard: () => set({ 
        activeWizard: null, 
        wizardStep: 0, 
        wizardData: {} 
      }),

      // Help center
      toggleHelpCenter: () => {
        const { helpCenterOpen } = get()
        set({ helpCenterOpen: !helpCenterOpen })
      },
      
      setHelpCenterOpen: (open) => set({ helpCenterOpen: open }),

      // Reset
      resetOnboarding: () => set({
        tourActive: false,
        tourCompleted: false,
        currentTourStep: 0,
        discoveredFeatures: [],
        activeWizard: null,
        wizardStep: 0,
        wizardData: {},
      }),
    }),
    {
      name: 'onboarding-storage',
      partialize: (state) => ({
        tourCompleted: state.tourCompleted,
        discoveredFeatures: state.discoveredFeatures,
        userRole: state.userRole,
      }),
    }
  )
)
