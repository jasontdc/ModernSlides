// Listen for timer updates sent from Main process
window.electronAPI.onSetSpeakerTimer((timerText) => {
  const target = document.getElementById('speaker-timer');
  if (target) target.textContent = timerText;
});

// Receive synced slide & notes payload
window.electronAPI.onSyncSpeakerData((data) => {
  const currentSlot = document.getElementById('speaker-current');
  const nextSlot = document.getElementById('speaker-next');
  const notes = document.getElementById('speaker-note-text');

  if (!currentSlot || !nextSlot) return;

  // Render Current Slide
  const existingCurrent = currentSlot.querySelector('.slide-frame');
  if (data.preserveLive && existingCurrent?.dataset.slideId === data.slideId) {
    if (typeof applyReveal === 'function') applyReveal(existingCurrent, data.currentStep);
  } else if (data.currentHTML) {
    currentSlot.innerHTML = data.currentHTML;
    if (typeof activateLiveWebsites === 'function') {
      const frame = currentSlot.querySelector('.slide-frame');
      if (frame) activateLiveWebsites(frame);
    }
  } else {
    currentSlot.textContent = '';
  }

  // Render Next Slide
  const existingNext = nextSlot.querySelector('.slide-frame');
  if (!(data.preserveLive && data.nextSlideId && existingNext?.dataset.slideId === data.nextSlideId)) {
    if (data.nextHTML) {
      nextSlot.innerHTML = data.nextHTML;
    } else {
      nextSlot.innerHTML = '<div style="display:grid;place-items:center;width:100%;height:100%;color:#888;font:600 1.4rem Inter,sans-serif;">End of presentation</div>';
    }
  }

  // Render Notes
  if (notes) notes.innerHTML = data.notesHTML;

  // Adjust layouts and typeset math
  window.fitSpeakerSlides?.();
  document.fonts?.ready?.then(() => window.fitSpeakerSlides?.());
  if (window.MathJax?.startup?.promise) {
    window.MathJax.startup.promise.then(() => window.MathJax.typesetPromise?.([notes])).catch(() => {});
  }
});

// Receive MathJax dynamic styles
window.electronAPI.onSyncSpeakerMathStyles((styles) => {
  styles.forEach(style => {
    let target = document.getElementById(style.id);
    if (!target) {
      target = document.createElement('style');
      target.id = style.id;
      document.head.appendChild(target);
    }
    target.textContent = style.content;
  });
});

// Layout scaling
window.fitSpeakerSlides = function() {
  document.querySelectorAll('.speaker-slot').forEach(function(slot) {
    var frame = slot.querySelector('.slide-frame');
    if (!frame) return;
    var s = Math.max(.01, Math.min(slot.clientWidth / 1600, slot.clientHeight / 900));
    frame.style.transform = 'scale(' + s + ')';
    frame.style.left = ((slot.clientWidth - 1600 * s) / 2) + 'px';
    frame.style.top = ((slot.clientHeight - 900 * s) / 2) + 'px';
  });
};
window.addEventListener('resize', window.fitSpeakerSlides);

// Send actions back to Main Process instead of using window.opener
document.getElementById('btn-prev')?.addEventListener('click', () => window.electronAPI.speakerAction('previous'));
document.getElementById('btn-next')?.addEventListener('click', () => window.electronAPI.speakerAction('next'));
document.getElementById('btn-reset')?.addEventListener('click', () => window.electronAPI.speakerAction('resetTimer'));