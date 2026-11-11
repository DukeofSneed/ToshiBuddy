// Speech bubble anchored above the pet's head.
(function () {
  const el = () => document.getElementById('bubble');
  const textEl = () => document.getElementById('bubble-text');
  let hideTimer = null;
  let visible = false;

  function durationFor(text) {
    return Math.min(11000, Math.max(2800, 1800 + text.length * 55));
  }

  function show(text, { ms } = {}) {
    const b = el();
    textEl().textContent = text;
    b.classList.remove('hidden');
    b.classList.remove('pop');
    void b.offsetWidth; // restart the pop animation
    b.classList.add('pop');
    if (!visible && window.BuddySfx) BuddySfx.play('pop');
    visible = true;
    position();
    clearTimeout(hideTimer);
    hideTimer = setTimeout(hide, ms || durationFor(text));
  }

  function hide() {
    const b = el();
    b.classList.add('hidden');
    visible = false;
    document.getElementById('pet').classList.remove('talk');
  }

  // Keep the bubble over the head and inside the screen.
  function position() {
    if (!visible) return;
    const pet = document.getElementById('pet');
    const b = el();
    const stage = document.getElementById('stage');
    const px = parseFloat(pet.style.left) || 0;
    const py = parseFloat(pet.style.top) || 0;
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    let left = px + 80 - bw / 2;
    left = Math.max(6, Math.min(stage.clientWidth - bw - 6, left));
    let top = py - bh - 16;
    if (top < 6) top = py + 60;
    b.style.left = `${left}px`;
    b.style.top = `${top}px`;
    const tail = document.getElementById('bubble-tail');
    const tailX = Math.max(14, Math.min(bw - 14, px + 80 - left));
    tail.style.left = `${tailX}px`;
  }

  function toast(text, ms = 4000) {
    const t = document.getElementById('toast');
    t.textContent = text;
    t.classList.remove('hidden');
    clearTimeout(t.__timer);
    t.__timer = setTimeout(() => t.classList.add('hidden'), ms);
  }

  window.BuddyBubble = { show, hide, position, toast, isVisible: () => visible };
})();
