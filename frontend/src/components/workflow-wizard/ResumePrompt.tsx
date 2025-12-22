/**
 * Resume Prompt Component
 * 
 * Displays a prompt when returning to an in-progress workflow,
 * allowing users to resume from where they left off.
 * 
 * Requirement 13.2: Display "Resume" prompt
 */

import React from 'react'
import { Phase, PHASE_CONFIG } from '@/types/workflow-wizard'
import { formatDistanceToNow } from 'date-fns'

interface ResumePromptProps {
  isOpen: boolean
  reportName: string
  lastModifiedAt: string
  currentPhase: Phase
  onResume: () => void
  onStartFresh: () => void
  onClose: () => void
}

export const ResumePrompt: React.FC<ResumePromptProps> = ({
  isOpen,
  reportName,
  lastModifiedAt,
  currentPhase,
  onResume,
  onStartFresh,
  onClose,
}) => {
  if (!isOpen) return null

  const phaseConfig = PHASE_CONFIG[currentPhase]
  const timeAgo = formatDistanceToNow(new Date(lastModifiedAt), { addSuffix: true })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="bg-blue-50 px-6 py-4 border-b border-blue-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center">
              <svg
                className="w-5 h-5 text-blue-600"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">
                Resume Your Progress?
              </h2>
              <p className="text-sm text-gray-600">
                You have unsaved progress from a previous session
              </p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-4">
          <div className="space-y-4">
            {/* Report Info */}
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="text-sm text-gray-500 mb-1">Report</div>
              <div className="font-medium text-gray-900">{reportName}</div>
            </div>

            {/* Progress Info */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Current Phase</div>
                <div className="font-medium text-gray-900">{phaseConfig.name}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-sm text-gray-500 mb-1">Last Saved</div>
                <div className="font-medium text-gray-900">{timeAgo}</div>
              </div>
            </div>

            <p className="text-sm text-gray-600">
              Would you like to continue from where you left off, or start fresh?
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex gap-3">
          <button
            onClick={onStartFresh}
            className="flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Start Fresh
          </button>
          <button
            onClick={onResume}
            className="flex-1 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Resume Progress
          </button>
        </div>

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          aria-label="Close"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>
  )
}

export default ResumePrompt
