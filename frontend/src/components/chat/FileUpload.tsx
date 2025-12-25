import * as React from 'react'
import { useState, useRef, useCallback } from 'react'
import { Upload, X, Loader2, CheckCircle, AlertCircle, Download } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'

export interface UploadedFile {
  file_id: string
  filename: string
  size: number
  content_type: string
  upload_timestamp: string
  analysis_status: 'pending' | 'completed' | 'failed'
  analysis_result?: string
}

export interface FileUploadProps {
  sessionId: string
  onFileUploaded?: (file: UploadedFile) => void
  onFileAnalyzed?: (file: UploadedFile) => void
  className?: string
  maxFiles?: number
  maxFileSize?: number
}

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.xlsx', '.csv', '.txt', '.json', '.xml', '.md']

export function FileUpload({
  sessionId,
  onFileUploaded,
  onFileAnalyzed,
  className,
  maxFiles = 5,
  maxFileSize = 50 * 1024 * 1024 // 50MB
}: FileUploadProps) {
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([])
  const [dragActive, setDragActive] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const validateFile = (file: File): string | null => {
    // Check file size
    if (file.size > maxFileSize) {
      return `File size ${(file.size / 1024 / 1024).toFixed(1)}MB exceeds maximum allowed size of ${maxFileSize / 1024 / 1024}MB`
    }

    // Check file type
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(fileExtension)) {
      return `File type ${fileExtension} is not supported. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`
    }

    // Check max files
    if (uploadedFiles.length >= maxFiles) {
      return `Maximum ${maxFiles} files allowed`
    }

    return null
  }

  const uploadFile = async (file: File): Promise<UploadedFile | null> => {
    const formData = new FormData()
    formData.append('file', file)
    formData.append('session_id', sessionId)

    try {
      const response = await fetch('/api/chat/upload', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.detail || 'Upload failed')
      }

      const result = await response.json()
      return result as UploadedFile
    } catch (error) {
      console.error('Upload error:', error)
      throw error
    }
  }

  const analyzeFile = async (fileId: string): Promise<void> => {
    try {
      const formData = new FormData()
      formData.append('session_id', sessionId)

      const response = await fetch(`/api/chat/analyze-file/${fileId}`, {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Analysis failed')
      }

      const result = await response.json()
      
      // Update file status
      setUploadedFiles(prev => prev.map(f => 
        f.file_id === fileId 
          ? { ...f, analysis_status: 'completed', analysis_result: result.extracted_text }
          : f
      ))

      // Notify parent component
      const updatedFile = uploadedFiles.find(f => f.file_id === fileId)
      if (updatedFile && onFileAnalyzed) {
        onFileAnalyzed({ ...updatedFile, analysis_status: 'completed', analysis_result: result.extracted_text })
      }
    } catch (error) {
      console.error('Analysis error:', error)
      // Update file status to failed
      setUploadedFiles(prev => prev.map(f => 
        f.file_id === fileId ? { ...f, analysis_status: 'failed' } : f
      ))
    }
  }

  const handleFiles = useCallback(async (files: FileList) => {
    const fileArray = Array.from(files)
    
    // Validate all files first
    for (const file of fileArray) {
      const error = validateFile(file)
      if (error) {
        alert(error)
        return
      }
    }

    setUploading(true)
    setUploadProgress(0)

    try {
      for (let i = 0; i < fileArray.length; i++) {
        const file = fileArray[i]
        setUploadProgress((i / fileArray.length) * 100)

        const uploadedFile = await uploadFile(file)
        if (uploadedFile) {
          setUploadedFiles(prev => [...prev, uploadedFile])
          onFileUploaded?.(uploadedFile)

          // Auto-analyze the file
          setTimeout(() => analyzeFile(uploadedFile.file_id), 500)
        }
      }
      setUploadProgress(100)
    } catch (error) {
      console.error('Upload process error:', error)
      alert('Upload failed: ' + (error as Error).message)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }, [sessionId, uploadedFiles.length, maxFiles, maxFileSize, onFileUploaded])

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      handleFiles(e.dataTransfer.files)
    }
  }, [handleFiles])

  const handleFileInput = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handleFiles(e.target.files)
    }
  }, [handleFiles])

  const removeFile = (fileId: string) => {
    setUploadedFiles(prev => prev.filter(f => f.file_id !== fileId))
  }

  const downloadFile = async (fileId: string, filename: string) => {
    try {
      const response = await fetch(`/api/download/file/${fileId}?session_id=${sessionId}`)
      if (!response.ok) throw new Error('Download failed')
      
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (error) {
      console.error('Download error:', error)
      alert('Download failed')
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getFileIcon = (contentType: string) => {
    if (contentType.includes('pdf')) return '📄'
    if (contentType.includes('word') || contentType.includes('document')) return '📝'
    if (contentType.includes('spreadsheet') || contentType.includes('excel')) return '📊'
    if (contentType.includes('csv')) return '📈'
    if (contentType.includes('json')) return '🔧'
    if (contentType.includes('xml')) return '🏷️'
    return '📁'
  }

  return (
    <div className={cn('space-y-4', className)}>
      {/* Upload Area */}
      <div
        className={cn(
          'border-2 border-dashed rounded-lg p-6 text-center transition-colors',
          dragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25',
          uploading ? 'pointer-events-none opacity-50' : 'cursor-pointer hover:border-primary/50'
        )}
        onDragEnter={handleDrag}
        onDragLeave={handleDrag}
        onDragOver={handleDrag}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ALLOWED_EXTENSIONS.join(',')}
          onChange={handleFileInput}
          className="hidden"
        />
        
        <Upload className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
        <p className="text-sm font-medium mb-2">
          {dragActive ? 'Drop files here' : 'Click to upload or drag and drop'}
        </p>
        <p className="text-xs text-muted-foreground">
          Supports: PDF, DOCX, XLSX, CSV, TXT, JSON, XML, MD
        </p>
        <p className="text-xs text-muted-foreground">
          Max {maxFiles} files, {maxFileSize / 1024 / 1024}MB each
        </p>
      </div>

      {/* Upload Progress */}
      {uploading && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Uploading files...</span>
          </div>
          <Progress value={uploadProgress} className="w-full" />
        </div>
      )}

      {/* Uploaded Files List */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium">Uploaded Files</h4>
          <div className="space-y-2">
            {uploadedFiles.map((file) => (
              <div
                key={file.file_id}
                className="flex items-center gap-3 p-3 border rounded-lg bg-muted/20"
              >
                <span className="text-lg">{getFileIcon(file.content_type)}</span>
                
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{file.filename}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatFileSize(file.size)} • {new Date(file.upload_timestamp).toLocaleString()}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Analysis Status */}
                  {file.analysis_status === 'pending' && (
                    <div className="flex items-center gap-1 text-amber-600">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      <span className="text-xs">Analyzing...</span>
                    </div>
                  )}
                  {file.analysis_status === 'completed' && (
                    <div className="flex items-center gap-1 text-green-600">
                      <CheckCircle className="h-3 w-3" />
                      <span className="text-xs">Analyzed</span>
                    </div>
                  )}
                  {file.analysis_status === 'failed' && (
                    <div className="flex items-center gap-1 text-red-600">
                      <AlertCircle className="h-3 w-3" />
                      <span className="text-xs">Failed</span>
                    </div>
                  )}

                  {/* Actions */}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => downloadFile(file.file_id, file.filename)}
                    className="h-6 w-6 p-0"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeFile(file.file_id)}
                    className="h-6 w-6 p-0 text-red-500 hover:text-red-700"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}