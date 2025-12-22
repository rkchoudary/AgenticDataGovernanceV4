import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { 
  Sparkles, 
  Shield, 
  Database, 
  GitBranch, 
  AlertTriangle,
  CheckCircle2,
  ArrowRight,
  Play,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useOnboardingStore } from '@/stores/onboardingStore'
import { RoleWalkthrough } from '@/components/onboarding/RoleWalkthrough'

const features = [
  {
    icon: Shield,
    title: 'Regulatory Compliance',
    description: 'Stay compliant with automated regulatory report tracking and BCBS 239 mapping.',
  },
  {
    icon: Database,
    title: 'Critical Data Elements',
    description: 'Identify, score, and manage your most critical data elements with AI assistance.',
  },
  {
    icon: GitBranch,
    title: 'Data Lineage',
    description: 'Visualize data flows from source systems through transformations to reports.',
  },
  {
    icon: AlertTriangle,
    title: 'Issue Management',
    description: 'Track, assign, and resolve data quality issues with AI-powered root cause analysis.',
  },
]

const benefits = [
  'AI-powered governance automation',
  'Real-time quality monitoring',
  'Collaborative workflows',
  'Comprehensive audit trails',
  'Role-based access control',
  'Interactive dashboards',
]

export function Welcome() {
  const navigate = useNavigate()
  const { tourCompleted, startTour } = useOnboardingStore()
  const [showRoleWalkthrough, setShowRoleWalkthrough] = useState(false)

  // If tour already completed, redirect to dashboard
  useEffect(() => {
    if (tourCompleted) {
      navigate('/')
    }
  }, [tourCompleted, navigate])

  const handleGetStarted = () => {
    setShowRoleWalkthrough(true)
  }

  const handleWalkthroughComplete = () => {
    navigate('/')
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
      {/* Hero Section */}
      <div className="container mx-auto px-4 py-16">
        <div className="text-center max-w-3xl mx-auto">
          <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
            <Sparkles className="h-4 w-4" />
            AI-Powered Data Governance
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight mb-4">
            Welcome to Data Governance
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Your intelligent platform for managing regulatory compliance, data quality, 
            and governance workflows with AI assistance.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button size="lg" onClick={handleGetStarted}>
              <Play className="h-5 w-5 mr-2" />
              Get Started
            </Button>
            <Button size="lg" variant="outline" onClick={() => startTour()}>
              Take a Quick Tour
            </Button>
          </div>
        </div>
      </div>

      {/* Features Section */}
      <div className="container mx-auto px-4 py-12">
        <h2 className="text-2xl font-semibold text-center mb-8">
          Everything you need for data governance
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map((feature, index) => (
            <Card key={index} className="border-0 shadow-md">
              <CardHeader>
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-2">
                  <feature.icon className="h-6 w-6 text-primary" />
                </div>
                <CardTitle className="text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{feature.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Benefits Section */}
      <div className="container mx-auto px-4 py-12">
        <div className="bg-card rounded-2xl p-8 md:p-12 shadow-lg">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <h2 className="text-2xl font-semibold mb-4">
                Why choose our platform?
              </h2>
              <p className="text-muted-foreground mb-6">
                Built for financial institutions with regulatory compliance at its core. 
                Our AI-powered platform helps you maintain data quality and governance 
                with minimal manual effort.
              </p>
              <ul className="space-y-3">
                {benefits.map((benefit, index) => (
                  <li key={index} className="flex items-center gap-3">
                    <CheckCircle2 className="h-5 w-5 text-green-500 shrink-0" />
                    <span>{benefit}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-muted/50 rounded-xl p-6">
              <h3 className="font-medium mb-4">Ready to explore?</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Start with a guided tour to learn about the key features, 
                or jump right in and explore on your own.
              </p>
              <Button className="w-full" onClick={handleGetStarted}>
                Start Your Journey
                <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Role Walkthrough Dialog */}
      <RoleWalkthrough
        open={showRoleWalkthrough}
        onOpenChange={setShowRoleWalkthrough}
        onComplete={handleWalkthroughComplete}
      />
    </div>
  )
}
