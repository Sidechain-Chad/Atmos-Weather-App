import { Controller } from "@hotwired/stimulus"

// Mouse "grab to scroll" for horizontal strips (the hourly forecast), with
// iOS-style elastic resistance at the edges and momentum/inertia on release —
// the same rubber-band curve UIScrollView uses. Touch and trackpad input are
// left completely alone; they already get the browser's own native momentum
// scrolling (and, on Safari, its own native bounce) for free.
export default class extends Controller {
  connect() {
    this.element.classList.add("drag-scroll")
    this.onDown = this.onDown.bind(this)
    this.onMove = this.onMove.bind(this)
    this.onUp = this.onUp.bind(this)
    this.element.addEventListener("pointerdown", this.onDown)
  }

  disconnect() {
    this.element.removeEventListener("pointerdown", this.onDown)
    this.cancelAnimation()
  }

  onDown(e) {
    if (e.pointerType !== "mouse" || e.button !== 0) return
    this.cancelAnimation()

    this.dragging = true
    this.moved = false
    // setPointerCapture (below) retargets every later event for this pointerId
    // to `this.element`, so e.target inside onUp is the container, not
    // whatever was actually pressed — remember the real target now.
    this.downTarget = e.target
    this.virtual = this.element.scrollLeft
    this.lastX = e.clientX
    this.lastT = performance.now()
    this.velocity = 0

    this.element.setPointerCapture(e.pointerId)
    this.element.classList.add("grabbing")
    this.element.addEventListener("pointermove", this.onMove)
    this.element.addEventListener("pointerup", this.onUp)
    this.element.addEventListener("pointercancel", this.onUp)
    e.preventDefault()
  }

  onMove(e) {
    if (!this.dragging) return
    const dx = e.clientX - this.lastX
    if (Math.abs(dx) > 3) this.moved = true

    const now = performance.now()
    const dt = Math.max(now - this.lastT, 1)
    this.velocity = this.velocity * 0.7 + (-dx / dt) * 0.3
    this.lastX = e.clientX
    this.lastT = now

    this.virtual -= dx
    this.applyVirtual(this.virtual)
    e.preventDefault()
  }

  onUp(e) {
    if (!this.dragging) return
    this.dragging = false
    this.element.classList.remove("grabbing")
    this.element.removeEventListener("pointermove", this.onMove)
    this.element.removeEventListener("pointerup", this.onUp)
    this.element.removeEventListener("pointercancel", this.onUp)
    // onDown's preventDefault() suppresses the browser's own click synthesis
    // for this whole interaction (per the Pointer Events spec), so a plain,
    // un-dragged click needs to be refired by hand for click->action bindings
    // (e.g. clicking a city pill) to still work. A drag that moved the strip
    // should NOT also fire a click on whatever it was released over.
    if (!this.moved && e.type !== "pointercancel" && this.downTarget) {
      this.downTarget.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }))
    }
    this.momentum(this.velocity)
  }

  // ============ physics ============
  maxScroll() {
    return Math.max(0, this.element.scrollWidth - this.element.clientWidth)
  }

  // Beyond the edge, native scrollLeft just clamps — so we keep it pinned at
  // the boundary and fake the elastic overshoot with a transform instead.
  applyVirtual(value) {
    const max = this.maxScroll()
    if (value < 0) {
      this.element.scrollLeft = 0
      this.element.style.transform = `translateX(${this.resist(-value)}px)`
    } else if (value > max) {
      this.element.scrollLeft = max
      this.element.style.transform = `translateX(${-this.resist(value - max)}px)`
    } else {
      this.element.scrollLeft = value
      this.element.style.transform = ""
    }
  }

  // UIScrollView's rubber-band curve: resistance grows with distance dragged,
  // asymptotically approaching clientWidth/constant so it never runs away.
  resist(overshoot, constant = 0.55) {
    const dimension = this.element.clientWidth
    return (overshoot * dimension * constant) / (dimension + constant * overshoot)
  }

  momentum(initialVelocity) {
    let v = initialVelocity
    let virtual = this.virtual
    let last = performance.now()
    const max = this.maxScroll()

    const step = now => {
      const dt = Math.min(now - last, 32)
      last = now
      const inBounds = virtual >= 0 && virtual <= max
      v *= Math.pow(inBounds ? 0.94 : 0.72, dt / 16.67)
      virtual += v * dt
      this.virtual = virtual
      this.applyVirtual(virtual)

      if (Math.abs(v) > 0.02) {
        this._raf = requestAnimationFrame(step)
      } else if (virtual < 0 || virtual > max) {
        this.snapBack()
      }
    }
    this._raf = requestAnimationFrame(step)
  }

  snapBack() {
    const max = this.maxScroll()
    const start = this.virtual
    const target = start < 0 ? 0 : max
    const duration = 320
    const startTime = performance.now()
    const easeOutCubic = t => 1 - Math.pow(1 - t, 3)

    const step = now => {
      const t = Math.min((now - startTime) / duration, 1)
      this.virtual = start + (target - start) * easeOutCubic(t)
      this.applyVirtual(this.virtual)
      if (t < 1) this._raf = requestAnimationFrame(step)
    }
    this._raf = requestAnimationFrame(step)
  }

  cancelAnimation() {
    if (this._raf) cancelAnimationFrame(this._raf)
    this._raf = null
  }
}
