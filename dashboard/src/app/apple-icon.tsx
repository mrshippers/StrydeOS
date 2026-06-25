import { ImageResponse } from 'next/og'
 
export const runtime = 'edge'
 
export const size = {
  width: 180,
  height: 180,
}
 
export const contentType = 'image/png'
 
export default function AppleIcon() {
  return new ImageResponse(
    (
      <svg
        width="180"
        height="180"
        viewBox="0 0 100 100"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <linearGradient id="gCont" x1="0.1" y1="0" x2="0.85" y2="1">
            <stop offset="0%" stopColor="#2E6BFF" stopOpacity="0.58" />
            <stop offset="100%" stopColor="#091D3E" stopOpacity="0.72" />
          </linearGradient>
          
          <radialGradient id="gRad" cx="28%" cy="24%" r="60%">
            <stop offset="0%" stopColor="#6AABFF" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#1C54F2" stopOpacity="0" />
          </radialGradient>
          
          <linearGradient id="gTopface" x1="0.05" y1="1" x2="0.35" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0.55" />
            <stop offset="100%" stopColor="white" stopOpacity="0.97" />
          </linearGradient>
          
          <linearGradient id="gRim" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="white" stopOpacity="0" />
            <stop offset="28%" stopColor="white" stopOpacity="0.60" />
            <stop offset="65%" stopColor="white" stopOpacity="0.12" />
            <stop offset="100%" stopColor="white" stopOpacity="0" />
          </linearGradient>
          
          <linearGradient id="gBorder" x1="0.1" y1="0" x2="0.4" y2="1">
            <stop offset="0%" stopColor="#7ABBFF" stopOpacity="0.65" />
            <stop offset="100%" stopColor="#1C54F2" stopOpacity="0.06" />
          </linearGradient>
          
          <clipPath id="cPillar">
            <rect x="35" y="20" width="22" height="60" rx="5" />
          </clipPath>
          
          <clipPath id="cAbove">
            <polygon points="35,52 57,40 57,20 35,20" />
          </clipPath>
        </defs>

        <rect width="100" height="100" rx="24" fill="url(#gCont)" />
        <rect width="100" height="100" rx="24" fill="url(#gRad)" />
        <rect width="100" height="100" rx="24" fill="none" stroke="url(#gBorder)" strokeWidth="1.2" />

        <path d="M 17 21 Q 50 12 83 21" stroke="url(#gRim)" strokeWidth="1.5" fill="none" strokeLinecap="round" />

        <rect x="35" y="20" width="22" height="60" rx="5" fill="white" fillOpacity="0.07" />


        <g clipPath="url(#cPillar)">
          <polyline
            points="32,80 46,72 60,80"
            stroke="white"
            strokeOpacity="0.20"
            strokeWidth="2.0"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <polyline
            points="32,72 46,64 60,72"
            stroke="white"
            strokeOpacity="0.42"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
          <polyline
            points="32,64 46,56 60,64"
            stroke="white"
            strokeOpacity="0.72"
            strokeWidth="3.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
          />
        </g>

        <rect
          x="35"
          y="20"
          width="22"
          height="60"
          rx="5"
          fill="url(#gTopface)"
          clipPath="url(#cAbove)"
        />

        <line
          x1="33"
          y1="52"
          x2="59"
          y2="39"
          stroke="white"
          strokeWidth="1.2"
          strokeOpacity="0.55"
          strokeLinecap="round"
        />
      </svg>
    ),
    {
      ...size,
    }
  )
}
