"use client"

import { resetAllScores } from "./actions"

export function ResetScoresButton() {
  return (
    <form
      action={resetAllScores}
      onSubmit={(e) => {
        if (
          !confirm(
            "Reset ALL scores to 0? This will clear all match results and cannot be undone."
          )
        ) {
          e.preventDefault()
        }
      }}
    >
      <button
        type="submit"
        className="rounded-md bg-red-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-red-700 transition-colors"
      >
        Reset All Scores
      </button>
    </form>
  )
}
