/**
 * Session Timeout Warning Component
 * 
 * Displays a warning when the user's session is about to expire,
 * and handles session expiration with re-authentication prompt.
 * 
 * Requirement 13.3: Session timeout handling
 */

import React, { useEffect, useState } from 'react'

interface SessionTimeoutWarningProps {
  minutesRemaining: number | null
  isExpired: boolean
  onExtendSession: () => void
  onReauthenticate: () => void
}

export const SessionTimeoutWarning: React.FC<SessionTimeoutWarningProps> = ({
  minutesRemaining,
  isExpired,
  onExtendSession,
  onReauthenticate,
}) => {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    // Show warning when less than 5 minutes remaining or expired
    setIsVisible(minutesRemaining !== null || isExpired)
  }, [minutesRemaining, isExpired])

  if (!isVisible) return null

  // Session expired - show re-authentication prompt
  if (isExpired) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
        <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden">
          {/* Header */}
          <div className="bg-red-50 px-6 py-4 border-b border-red-100">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center">
                <svg
                  className="w-5 h-5 text-red-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h2 className="text-lg font-semibold text-gray-900">
                  Session Expired
                </h2>
                <p className="text-sm text-gray-600">
                  Your session has timed out
                </p>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="px-6 py-4">
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-4 bg-green-50 rounded-lg border border-green-100">
                <svg
                  className="w-5 h-5 text-green-600 mt-0.5"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
                <div>
                  <div className="font-medium text-green-800">
                    Your work has been saved
                  </div>
                  <div className="text-sm text-green-700">
                    All your progress has been preserved locally and will be restored after you sign in again.
                  </div>
                </div>
              </div>

              <p className="text-sm text-gray-600">
                Please sign in again to continue working on your workflow.
              </p>
            </div>
          </div>

          {/* Actions */}
          <div className="px-6 py-4 bg-gray-50 border-t border-gray-100">
            <button
              onClick={onReauthenticate}
              className="w-full px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Sign In Again
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Session warning - show countdown
  return (
    <div className="fixed bottom-4 right-4 z-40 max-w-sm">
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg shadow-lg overflow-hidden">
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg
                className="w-5 h-5 text-yellow-600"
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
            <div className="flex-1">
              <h3 className="text-sm font-medium text-yellow-800">
                Session Expiring Soon
              </h3>
              <p className="mt-1 text-sm text-yellow-700">
                Your session will expire in{' '}
                <span className="font-semibold">
                  {minutesRemaining} minute{minutesRemaining !== 1 ? 's' : ''}
                </span>
                . Your work will be saved automatically.
              </p>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={onExtendSession}
                  className="px-3 py-1.5 text-xs font-medium text-yellow-800 bg-yellow-100 rounded hover:bg-yellow-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
                >
                  Extend Session
                </button>
                <button
                  onClick={() => setIsVisible(false)}
                  className="px-3 py-1.5 text-xs font-medium text-yellow-600 hover:text-yellow-800"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default SessionTimeoutWarning
