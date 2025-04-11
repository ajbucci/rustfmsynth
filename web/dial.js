// javascript dial implementation
export function createDial() {
  var dial = document.createElement("div");
  const radius = 35;
  const indHeight = radius / 2;
  const indWidth = 2;
  const indInset = 0;
  dial.classList.add("dial");
  dial.style.width = `${radius * 2}px`;
  dial.style.height = dial.style.width;
  var indicator = document.createElement("div");
  indicator.classList.add("dial-indicator");
  indicator.style.width = `${indWidth}px`;
  indicator.style.height = `${indHeight}px`;
  indicator.style.borderRadius = `${indWidth / 2}px`;
  dial.appendChild(indicator);
  indicator.style.top = `${indInset}px`;
  indicator.style.left = "50%";
  indicator.style.transformOrigin = `center ${radius - indInset}px`;

  let isDragging = false;

  const dialInput = document.createElement("input");
  dialInput.id = "dial-input";

  dial.addEventListener("mousedown", (event) => {
    isDragging = true;
    document.body.style.userSelect = "none"; // Disable text selection
  });

  let lastAngle = 0;
  let cumulativeRotation = 0;

  document.addEventListener("mousemove", (event) => {
    if (!isDragging) return;

    const rect = dial.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const angle = Math.atan2(event.clientY - centerY, event.clientX - centerX) * (180 / Math.PI);
    let adjustedAngle = angle + 90; // Adjust to align with the part furthest from the indicator

    // Normalize angle to prevent snapping
    if (adjustedAngle - lastAngle > 180) {
      cumulativeRotation -= 360;
    } else if (adjustedAngle - lastAngle < -180) {
      cumulativeRotation += 360;
    }

    // Increment cumulative rotation by the difference between the current and last angle
    cumulativeRotation += adjustedAngle - lastAngle;
    lastAngle = adjustedAngle; // Update last angle

    // Calculate the logarithmic value based on cumulative rotation
    const logBase = 2; // Base for the logarithmic scale
    const rotationFraction = parseFloat(cumulativeRotation) / 360.0;

    let value = Math.pow(logBase, rotationFraction); // Ensure smooth logarithmic scaling

    // Make powers of 2 "sticky" only when close enough
    const logValue = Math.log2(value);
    const roundedLogValue = Math.round(logValue);
    if (Math.abs(logValue - roundedLogValue) < 0.1) { // Stickiness threshold
      value = Math.pow(2, roundedLogValue);
    }
    // clamp value to between 1/32 and 32
    value = Math.max(1 / 32, Math.min(value, 32));

    // Update the input box with the calculated value
    const inputBox = document.getElementById("dial-input");
    inputBox.value = value.toFixed(3); // Display with 2 decimal places

    indicator.style.transform = `rotate(${adjustedAngle}deg)`;
  });

  document.addEventListener("mouseup", () => {
    isDragging = false;
    document.body.style.userSelect = ""; // Re-enable text selection
  });

  const container = document.getElementById("operator-controls");
  container.append(dial);
  container.append(dialInput);
}

