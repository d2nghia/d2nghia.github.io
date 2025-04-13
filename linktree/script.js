document.addEventListener('DOMContentLoaded', () => {
    const topCircle = document.querySelector('.circle-top');
    const bottomCircle = document.querySelector('.circle-bottom');
    const chicken = document.querySelector('.minecraft-chicken');
    const speechBubble = document.querySelector('.speech-bubble');
    const speechTrail = document.querySelector('.speech-trail');
    let rotation = 0;
    let isMovingRight = true;

    function animate() {
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