import { ImageResponse } from "next/og";

// Favicon for the Ramps / Exchanges Transfer Simulator.
// Two opposing arrows = the exchange / swap mark (assets moving in and out).
export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#1a1a1a",
          borderRadius: 7,
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#ffffff"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {/* top arrow: pointing right */}
          <path d="M4 8.5h15" />
          <path d="M15 4.5l4 4-4 4" />
          {/* bottom arrow: pointing left */}
          <path d="M20 15.5H5" />
          <path d="M9 11.5l-4 4 4 4" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
