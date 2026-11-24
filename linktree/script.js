document.addEventListener('DOMContentLoaded', () => {
    const topCircle = document.querySelector('.circle-top');
    const bottomCircle = document.querySelector('.circle-bottom');
    const chicken = document.querySelector('.minecraft-chicken');
    const speechBubble = document.querySelector('.speech-bubble');
    const speechTrail = document.querySelector('.speech-trail');
    let rotation = 0;
    let isMovingRight = true;


    // Hop over the cursor when it stands in the chicken's path.
    const HOP_MS = 620;        // must match the hop animation in style.css
    const LOOK_AHEAD = 70;     // how far ahead the chicken notices the cursor
    const BAND_ABOVE = 45;     // cursor counts as "in the way" this far above it
    const BAND_BELOW = 25;
    let pointer = null;
    let previousX = null;
    let hopUntil = 0;

    window.addEventListener('mousemove', (event) => {
        pointer = { x: event.clientX, y: event.clientY };
    });
    window.addEventListener('mouseleave', () => {
        pointer = null;
    });

    function maybeHop(now) {
        if (!pointer || now < hopUntil) {
            return;
        }
        const box = chicken.getBoundingClientRect();
        const centreX = box.left + box.width / 2;
        if (previousX === null) {
            previousX = centreX;
            return;
        }
        const step = centreX - previousX;
        previousX = centreX;
        if (Math.abs(step) < 0.05) {
            return; // standing still, nothing to hop over
        }
        const inBand = pointer.y > box.top - BAND_ABOVE && pointer.y < box.bottom + BAND_BELOW;
        const ahead = (pointer.x - centreX) * Math.sign(step);
        if (inBand && ahead > 0 && ahead < LOOK_AHEAD) {
            hopUntil = now + HOP_MS + 180; // land before thinking about the next hop
            chicken.classList.remove('jumping');
            void chicken.offsetWidth; // restart the animation
            chicken.classList.add('jumping');
            setTimeout(() => chicken.classList.remove('jumping'), HOP_MS);
        }
    }

    function animate(now) {
        maybeHop(now || performance.now());
        rotation += 0.5;
        topCircle.style.transform = `translateX(-50%) rotate(${rotation}deg)`;
        bottomCircle.style.transform = `translateX(-50%) rotate(${180 + rotation}deg)`;
        requestAnimationFrame(animate);
    }

    function updateSpeechVisibility() {
        if (isMovingRight) {
            speechBubble.style.visibility = 'visible';
            speechTrail.style.visibility = 'visible';
        } else {
            speechBubble.style.visibility = 'hidden';
            speechTrail.style.visibility = 'hidden';
        }
    }

    // Simulate direction change based on animation timing
    setInterval(() => {
        isMovingRight = !isMovingRight;
        updateSpeechVisibility();
    }, 5000); // Adjust timing to match the animation duration

    animate();
});