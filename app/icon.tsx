import { ImageResponse } from "next/og";

// Favicon for the Ramps / Exchanges Deposit Simulator.
// A downward arrow landing on a baseline = a deposit / on-ramp into an account.
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
          {/* arrow shaft + head: funds moving down into the account */}
          <path d="M12 3v11" />
          <path d="M7 9.5l5 5 5-5" />
          {/* baseline: the account / destination */}
          <path d="M5 20h14" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}
