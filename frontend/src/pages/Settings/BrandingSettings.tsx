import { useState, useRef, useCallback, useEffect } from 'react'
import {
  Upload,
  Image,
  Palette,
  Globe,
  Eye,
  Save,
  RotateCcw,
  Check,
  X,
  Loader2,
  RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Separator } from '@/components/ui/separator'
import {
  useBranding,
  useUpdateBranding,
  usePublishBranding,
  useUploadBrandingAsset,
  useResetBranding,
  type BrandingConfig,
  type BrandingUpdateInput,
} from '@/hooks/useBranding'
import { useTheme } from '@/components/theme'
import { WhiteLabelConfig } from '@/components/branding'
import { cn } from '@/lib/utils'

interface ColorPickerProps {
  label: string
  value: string
  onChange: (value: string) => void
  description?: string
}

function ColorPicker({ label, value, onChange, description }: ColorPickerProps) {
  const [inputValue, setInputValue] = useState(value)
  
  useEffect(() => {
    setInputValue(value)
  }, [value])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setInputValue(newValue)
    if (/^#[0-9A-Fa-f]{6}$/.test(newValue)) {
      onChange(newValue)
    }
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={value}
          onChange={(e) => {
            setInputValue(e.target.value)
            onChange(e.target.value)
          }}
          className="h-10 w-14 rounded border cursor-pointer"
        />
        <input
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          placeholder="#000000"
          className="flex-1 px-3 py-2 border rounded-md bg-background text-sm font-mono"
        />
        <div
          className="h-10 w-10 rounded border"
          style={{ backgroundColor: value }}
        />
      </div>
    </div>
  )
}


interface FileUploadProps {
  label: string
  description: string
  currentUrl?: string
  accept: string
  onUpload: (file: File) => void
  onRemove: () => void
  isUploading?: boolean
  previewSize?: 'sm' | 'md' | 'lg'
}

function FileUpload({
  label,
  description,
  currentUrl,
  accept,
  onUpload,
  onRemove,
  isUploading,
  previewSize = 'md',
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragOver, setDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file) onUpload(file)
    },
    [onUpload]
  )

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) onUpload(file)
  }

  const sizeClasses = {
    sm: 'h-16 w-16',
    md: 'h-24 w-24',
    lg: 'h-32 w-full max-w-md',
  }

  return (
    <div className="space-y-2">
      <label className="text-sm font-medium">{label}</label>
      <p className="text-xs text-muted-foreground">{description}</p>
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-4 transition-colors',
          dragOver ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          'hover:border-primary/50'
        )}
        onDragOver={(e) => {
          e.preventDefault()
          setDragOver(true)
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {currentUrl ? (
          <div className="flex items-center gap-4">
            <div className={cn('relative rounded overflow-hidden bg-muted', sizeClasses[previewSize])}>
              <img
                src={currentUrl}
                alt={label}
                className="h-full w-full object-contain"
              />
            </div>
            <div className="flex flex-col gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => inputRef.current?.click()}
                disabled={isUploading}
              >
                {isUploading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4 mr-2" />
                )}
                Replace
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onRemove}
                className="text-destructive hover:text-destructive"
              >
                <X className="h-4 w-4 mr-2" />
                Remove
              </Button>
            </div>
          </div>
        ) : (
          <div
            className="flex flex-col items-center justify-center py-6 cursor-pointer"
            onClick={() => inputRef.current?.click()}
          >
            {isUploading ? (
              <Loader2 className="h-8 w-8 text-muted-foreground animate-spin mb-2" />
            ) : (
              <Image className="h-8 w-8 text-muted-foreground mb-2" />
            )}
            <p className="text-sm text-muted-foreground">
              {isUploading ? 'Uploading...' : 'Click or drag to upload'}
            </p>
          </div>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleFileSelect}
        className="hidden"
      />
    </div>
  )
}


interface LivePreviewProps {
  branding: BrandingUpdateInput & Partial<BrandingConfig>
}

function LivePreview({ branding }: LivePreviewProps) {
  return (
    <div className="border rounded-lg overflow-hidden bg-background">
      <div className="p-3 border-b bg-muted/50">
        <p className="text-sm font-medium">Live Preview</p>
      </div>
      <div className="p-4 space-y-4">
        {/* Header Preview */}
        <div
          className="rounded-lg p-3 flex items-center gap-3"
          style={{ backgroundColor: branding.primaryColor }}
        >
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt="Logo" className="h-8 w-auto" />
          ) : (
            <div className="h-8 w-8 bg-white/20 rounded" />
          )}
          <span className="text-white font-medium">Your Platform</span>
        </div>

        {/* Button Preview */}
        <div className="flex gap-2">
          <button
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: branding.primaryColor }}
          >
            Primary Button
          </button>
          <button
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: branding.secondaryColor }}
          >
            Secondary
          </button>
          <button
            className="px-4 py-2 rounded-md text-white text-sm font-medium"
            style={{ backgroundColor: branding.accentColor }}
          >
            Accent
          </button>
        </div>

        {/* Chart Palette Preview */}
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">Chart Colors</p>
          <div className="flex gap-1">
            {branding.chartPalette?.map((color, i) => (
              <div
                key={i}
                className="h-6 flex-1 rounded"
                style={{ backgroundColor: color }}
              />
            ))}
          </div>
        </div>

        {/* Card Preview */}
        <div className="border rounded-lg p-3">
          <div className="flex items-center gap-2 mb-2">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: branding.accentColor }}
            />
            <span className="text-sm font-medium">Sample Card</span>
          </div>
          <p className="text-xs text-muted-foreground">
            This is how cards will appear with your branding.
          </p>
        </div>
      </div>
    </div>
  )
}


export function BrandingSettings() {
  const { data: branding, isLoading } = useBranding()
  const updateBranding = useUpdateBranding()
  const publishBranding = usePublishBranding()
  const uploadAsset = useUploadBrandingAsset()
  const resetBranding = useResetBranding()
  const { applyBranding: applyTheme, resetToDefault: resetTheme } = useTheme()

  const [activeTab, setActiveTab] = useState('assets')
  const [localBranding, setLocalBranding] = useState<BrandingUpdateInput>({})
  const [hasChanges, setHasChanges] = useState(false)
  const [livePreviewEnabled, setLivePreviewEnabled] = useState(true)

  useEffect(() => {
    if (branding) {
      setLocalBranding({
        logoUrl: branding.logoUrl,
        faviconUrl: branding.faviconUrl,
        loginBackgroundUrl: branding.loginBackgroundUrl,
        primaryColor: branding.primaryColor,
        secondaryColor: branding.secondaryColor,
        accentColor: branding.accentColor,
        chartPalette: branding.chartPalette,
        customDomain: branding.customDomain,
        removePlatformBranding: branding.removePlatformBranding,
        customEmailSender: branding.customEmailSender,
      })
    }
  }, [branding])

  // Apply live preview when branding changes
  useEffect(() => {
    if (livePreviewEnabled && localBranding.primaryColor) {
      applyTheme(localBranding as Partial<BrandingConfig>)
    }
  }, [localBranding, livePreviewEnabled, applyTheme])

  const handleChange = <K extends keyof BrandingUpdateInput>(
    key: K,
    value: BrandingUpdateInput[K]
  ) => {
    setLocalBranding((prev) => ({ ...prev, [key]: value }))
    setHasChanges(true)
  }

  const handleUpload = async (file: File, type: 'logo' | 'favicon' | 'background') => {
    try {
      const result = await uploadAsset.mutateAsync({ file, type })
      const key = type === 'logo' ? 'logoUrl' : type === 'favicon' ? 'faviconUrl' : 'loginBackgroundUrl'
      handleChange(key, result.url)
    } catch (error) {
      console.error('Upload failed:', error)
    }
  }

  const handleSave = async () => {
    try {
      await updateBranding.mutateAsync(localBranding)
      setHasChanges(false)
    } catch (error) {
      console.error('Save failed:', error)
    }
  }

  const handlePublish = async () => {
    try {
      await publishBranding.mutateAsync()
    } catch (error) {
      console.error('Publish failed:', error)
    }
  }

  const handleReset = async () => {
    try {
      await resetBranding.mutateAsync()
      resetTheme()
      setHasChanges(false)
    } catch (error) {
      console.error('Reset failed:', error)
    }
  }

  const toggleLivePreview = () => {
    if (livePreviewEnabled) {
      // Disable live preview - reset to saved branding
      if (branding) {
        applyTheme(branding)
      } else {
        resetTheme()
      }
    }
    setLivePreviewEnabled(!livePreviewEnabled)
  }

  const handleChartColorChange = (index: number, color: string) => {
    const newPalette = [...(localBranding.chartPalette || [])]
    newPalette[index] = color
    handleChange('chartPalette', newPalette)
  }

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  const previewBranding = {
    ...branding,
    ...localBranding,
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">Branding Settings</h1>
          <p className="text-muted-foreground">
            Customize the platform appearance to match your organization's brand
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={livePreviewEnabled ? 'default' : 'outline'}
            size="sm"
            onClick={toggleLivePreview}
          >
            <RefreshCw className={cn('h-4 w-4 mr-2', livePreviewEnabled && 'animate-pulse')} />
            Live Preview {livePreviewEnabled ? 'On' : 'Off'}
          </Button>
          <Button
            variant="outline"
            onClick={handleReset}
            disabled={resetBranding.isPending}
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Default
          </Button>
          <Button
            variant="outline"
            onClick={handleSave}
            disabled={!hasChanges || updateBranding.isPending}
          >
            {updateBranding.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Save Draft
          </Button>
          <Button
            onClick={handlePublish}
            disabled={publishBranding.isPending}
          >
            {publishBranding.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Check className="h-4 w-4 mr-2" />
            )}
            Publish Changes
          </Button>
        </div>
      </div>

      {hasChanges && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 flex items-center gap-2">
          <Eye className="h-4 w-4 text-yellow-600" />
          <span className="text-sm text-yellow-800">
            You have unsaved changes. Save as draft or publish to apply.
          </span>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Settings Panel */}
        <div className="lg:col-span-2">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList>
              <TabsTrigger value="assets">
                <Image className="h-4 w-4 mr-2" />
                Assets
              </TabsTrigger>
              <TabsTrigger value="colors">
                <Palette className="h-4 w-4 mr-2" />
                Colors
              </TabsTrigger>
              <TabsTrigger value="whitelabel">
                <Globe className="h-4 w-4 mr-2" />
                White Label
              </TabsTrigger>
            </TabsList>

            <TabsContent value="assets" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Logo & Assets</CardTitle>
                  <CardDescription>
                    Upload your organization's logo, favicon, and login background
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <FileUpload
                    label="Logo"
                    description="Recommended: PNG or SVG, 200x50px minimum"
                    currentUrl={localBranding.logoUrl}
                    accept="image/png,image/svg+xml,image/jpeg"
                    onUpload={(file) => handleUpload(file, 'logo')}
                    onRemove={() => handleChange('logoUrl', undefined)}
                    isUploading={uploadAsset.isPending}
                    previewSize="md"
                  />

                  <Separator />

                  <FileUpload
                    label="Favicon"
                    description="Recommended: ICO or PNG, 32x32px"
                    currentUrl={localBranding.faviconUrl}
                    accept="image/x-icon,image/png"
                    onUpload={(file) => handleUpload(file, 'favicon')}
                    onRemove={() => handleChange('faviconUrl', undefined)}
                    isUploading={uploadAsset.isPending}
                    previewSize="sm"
                  />

                  <Separator />

                  <FileUpload
                    label="Login Background"
                    description="Recommended: JPG or PNG, 1920x1080px"
                    currentUrl={localBranding.loginBackgroundUrl}
                    accept="image/png,image/jpeg"
                    onUpload={(file) => handleUpload(file, 'background')}
                    onRemove={() => handleChange('loginBackgroundUrl', undefined)}
                    isUploading={uploadAsset.isPending}
                    previewSize="lg"
                  />
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="colors" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle>Brand Colors</CardTitle>
                  <CardDescription>
                    Define your primary, secondary, and accent colors
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <ColorPicker
                    label="Primary Color"
                    description="Used for navigation, buttons, and key UI elements"
                    value={localBranding.primaryColor || '#3b82f6'}
                    onChange={(value) => handleChange('primaryColor', value)}
                  />

                  <ColorPicker
                    label="Secondary Color"
                    description="Used for secondary buttons and less prominent elements"
                    value={localBranding.secondaryColor || '#64748b'}
                    onChange={(value) => handleChange('secondaryColor', value)}
                  />

                  <ColorPicker
                    label="Accent Color"
                    description="Used for highlights, success states, and emphasis"
                    value={localBranding.accentColor || '#10b981'}
                    onChange={(value) => handleChange('accentColor', value)}
                  />

                  <Separator />

                  <div className="space-y-3">
                    <label className="text-sm font-medium">Chart Palette</label>
                    <p className="text-xs text-muted-foreground">
                      Colors used in charts and data visualizations
                    </p>
                    <div className="grid grid-cols-3 gap-4">
                      {(localBranding.chartPalette || []).map((color, index) => (
                        <div key={index} className="space-y-1">
                          <label className="text-xs text-muted-foreground">
                            Color {index + 1}
                          </label>
                          <div className="flex items-center gap-2">
                            <input
                              type="color"
                              value={color}
                              onChange={(e) => handleChartColorChange(index, e.target.value)}
                              className="h-8 w-10 rounded border cursor-pointer"
                            />
                            <input
                              type="text"
                              value={color}
                              onChange={(e) => handleChartColorChange(index, e.target.value)}
                              className="flex-1 px-2 py-1 border rounded text-xs font-mono"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="whitelabel" className="space-y-4">
              <WhiteLabelConfig
                customDomain={localBranding.customDomain}
                customEmailSender={localBranding.customEmailSender}
                removePlatformBranding={localBranding.removePlatformBranding || false}
                onCustomDomainChange={(value) => handleChange('customDomain', value)}
                onCustomEmailSenderChange={(value) => handleChange('customEmailSender', value)}
                onRemovePlatformBrandingChange={(value) => handleChange('removePlatformBranding', value)}
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* Live Preview Panel */}
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <LivePreview branding={previewBranding} />
          </div>
        </div>
      </div>
    </div>
  )
}

export default BrandingSettings
