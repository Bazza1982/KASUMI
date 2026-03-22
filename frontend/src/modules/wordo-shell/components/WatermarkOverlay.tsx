// Visual watermark overlay rendered on each page card
import React from 'react'
import type { WatermarkConfig } from '../types/document'

interface Props {
  config: WatermarkConfig
  pageWidth: number
  pageHeight: number
}

export const WatermarkOverlay: React.FC<Props> = ({ config, pageWidth, pageHeight }) => {
  if (!config.enabled) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: 0, left: 0,
        width: pageWidth, height: pageHeight,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        pointerEvents: 'none',
        zIndex: 0,
        overflow: 'hidden',
      }}
    >
      {config.text && (
        <span
          style={{
            fontSize: Math.round(pageWidth * 0.12),
            fontWeight: 900,
            color: `rgba(180,180,180,${config.opacity})`,
            transform: `rotate(${config.angle}deg)`,
            userSelect: 'none',
            whiteSpace: 'nowrap',
            letterSpacing: 4,
            textTransform: 'uppercase',
          }}
        >
          {config.text}
        </span>
      )}
    </div>
  )
}
