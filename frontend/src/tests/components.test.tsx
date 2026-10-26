import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { Slider } from "../components/ui/Slider";
import { Segmented } from "../components/ui/Segmented";
import { Button } from "../components/ui/Button";
import { Marquee } from "../components/ui/Marquee";
import { Switch } from "../components/ui/Switch";
import { Select } from "../components/ui/Select";

describe("UI Primitives", () => {
  describe("Slider", () => {
    it("handles keyboard navigation (arrows, Shift for 5x, Home, End)", async () => {
      const handleChange = vi.fn();
      render(
        <Slider
          min={0}
          max={66}
          step={1}
          value={24}
          reliableThreshold={44}
          onChange={handleChange}
        />
      );

      const slider = screen.getByRole("slider");
      expect(slider).toHaveAttribute("aria-valuenow", "24");
      expect(slider).toHaveAttribute("aria-valuemin", "0");
      expect(slider).toHaveAttribute("aria-valuemax", "66");

      slider.focus();

      // Right arrow -> +1
      fireEvent.keyDown(slider, { key: "ArrowRight" });
      expect(handleChange).toHaveBeenCalledWith(25);

      // Left arrow -> -1
      fireEvent.keyDown(slider, { key: "ArrowLeft" });
      expect(handleChange).toHaveBeenCalledWith(23);

      // Shift + Right arrow -> +5
      fireEvent.keyDown(slider, { key: "ArrowRight", shiftKey: true });
      expect(handleChange).toHaveBeenCalledWith(29);

      // Shift + Left arrow -> -5
      fireEvent.keyDown(slider, { key: "ArrowLeft", shiftKey: true });
      expect(handleChange).toHaveBeenCalledWith(19);

      // Home -> min (0)
      fireEvent.keyDown(slider, { key: "Home" });
      expect(handleChange).toHaveBeenCalledWith(0);

      // End -> max (66)
      fireEvent.keyDown(slider, { key: "End" });
      expect(handleChange).toHaveBeenCalledWith(66);
    });

    it("advances sequentially on rapid consecutive ArrowRight keydown events", () => {
      let currentValue = 0;
      const { rerender } = render(
        <Slider
          min={0}
          max={66}
          step={1}
          value={currentValue}
          onChange={(val) => {
            currentValue = val;
          }}
        />
      );

      const slider = screen.getByRole("slider");
      slider.focus();

      for (let i = 0; i < 24; i++) {
        fireEvent.keyDown(slider, { key: "ArrowRight" });
        rerender(
          <Slider
            min={0}
            max={66}
            step={1}
            value={currentValue}
            onChange={(val) => {
              currentValue = val;
            }}
          />
        );
      }

      expect(currentValue).toBe(24);
    });
  });

  describe("Segmented", () => {
    it("renders role='radiogroup' and navigates between options with keyboard", async () => {
      const handleChange = vi.fn();
      const options = [
        { value: "day_ahead", label: "Day-Ahead Cutoff" },
        { value: "lead_time", label: "Lead Time Grid" },
      ];

      render(
        <Segmented
          value="day_ahead"
          onChange={handleChange}
          options={options}
          ariaLabel="Policy Selection"
        />
      );

      const radioGroup = screen.getByRole("radiogroup");
      expect(radioGroup).toHaveAttribute("aria-label", "Policy Selection");

      const radios = screen.getAllByRole("radio");
      expect(radios).toHaveLength(2);
      expect(radios[0]).toHaveAttribute("aria-checked", "true");
      expect(radios[1]).toHaveAttribute("aria-checked", "false");

      // Press ArrowRight to move to next option
      radios[0]?.focus();
      fireEvent.keyDown(radios[0]!, { key: "ArrowRight" });
      expect(handleChange).toHaveBeenCalledWith("lead_time");
    });
  });

  describe("Button", () => {
    it("renders primary variant with proper neo-brutalist active and disabled states", () => {
      const { rerender } = render(<Button variant="primary">RUN FORECAST</Button>);
      const btn = screen.getByRole("button", { name: "RUN FORECAST" });
      expect(btn).toBeInTheDocument();
      expect(btn).toHaveClass("bg-[#FFE94A]");

      rerender(<Button variant="primary" disabled>RUN FORECAST</Button>);
      expect(btn).toBeDisabled();
      expect(btn).toHaveClass("disabled:opacity-50");

      rerender(<Button variant="primary" isLoading>RUN FORECAST</Button>);
      expect(btn).toBeDisabled();
      expect(screen.getByText(/loading/i)).toBeInTheDocument();
    });

    it("includes active-state CSS classes for press animation", () => {
      render(<Button variant="primary">PRESS ME</Button>);
      const btn = screen.getByRole("button", { name: "PRESS ME" });
      expect(btn.className).toContain("active:translate-x-[3px]");
      expect(btn.className).toContain("active:translate-y-[3px]");
      expect(btn.className).toContain("active:shadow-none");
    });
  });

  describe("Switch", () => {
    it("handles click and spacebar toggling and updates aria-checked", () => {
      const handleChange = vi.fn();
      const { rerender } = render(
        <Switch
          checked={false}
          onChange={handleChange}
          label="Reveal actual generation"
        />
      );

      const switchBtn = screen.getByRole("switch", { name: "Reveal actual generation" });
      expect(switchBtn).toHaveAttribute("aria-checked", "false");

      // Click toggle
      fireEvent.click(switchBtn);
      expect(handleChange).toHaveBeenCalledWith(true);

      // Keyboard toggle (Space)
      fireEvent.keyDown(switchBtn, { key: " " });
      expect(handleChange).toHaveBeenCalledWith(true);

      rerender(
        <Switch
          checked={true}
          onChange={handleChange}
          label="Reveal actual generation"
        />
      );
      expect(switchBtn).toHaveAttribute("aria-checked", "true");
    });
  });

  describe("Select", () => {
    it("renders with associated label and accessible name", () => {
      const handleChange = vi.fn();
      render(
        <Select
          label="Decision Cutoff"
          value="09:00"
          onChange={handleChange}
          options={[
            { value: "07:30", label: "07:30 run" },
            { value: "09:00", label: "09:00 run" },
          ]}
        />
      );

      const select = screen.getByRole("combobox", { name: "Decision Cutoff" });
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue("09:00");

      fireEvent.change(select, { target: { value: "07:30" } });
      expect(handleChange).toHaveBeenCalledWith("07:30");
    });
  });

  describe("Marquee", () => {
    it("renders items continuously in ticker track and includes motion-reduce classes", () => {
      render(
        <Marquee
          items={["MAE: 2,127.5 MW", "BIAS: +1,851.5 MW", "RMSE: 2,050.2 MW"]}
        />
      );

      // In Marquee, items are duplicated for continuous scroll loop
      const maeElements = screen.getAllByText("MAE: 2,127.5 MW");
      expect(maeElements.length).toBeGreaterThanOrEqual(1);

      // Verified motion-reduce static class is present on track container
      const track = maeElements[0]?.closest("div.will-change-transform");
      expect(track?.className).toContain("motion-reduce:animate-none");
      expect(track?.className).toContain("motion-reduce:transform-none");
    });
  });
});
