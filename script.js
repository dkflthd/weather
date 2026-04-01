// 모바일 메뉴
const menuToggle = document.getElementById("menuToggle");
const navMenu = document.getElementById("navMenu");

if (menuToggle && navMenu) {
  menuToggle.addEventListener("click", () => {
    navMenu.classList.toggle("show");
  });

  navMenu.querySelectorAll("a").forEach((link) => {
    link.addEventListener("click", () => {
      navMenu.classList.remove("show");
    });
  });
}

// 퀴즈 기능
const submitQuizBtn = document.getElementById("submitQuiz");
const resetQuizBtn = document.getElementById("resetQuiz");
const quizResult = document.getElementById("quizResult");

const answers = {
  q1: "b",
  q2: "c",
  q3: "a",
  q4: "b",
};

const explanations = {
  q1: "기후변화의 주요 원인 중 하나는 화석연료 사용으로 인한 온실가스 증가입니다.",
  q2: "해수면 상승과 극한기상 증가는 기후변화의 영향이지만, 지구 자전 속도 증가는 일반적인 설명이 아닙니다.",
  q3: "AI는 위성사진과 다양한 기후 데이터를 분석해 변화를 파악하고 예측하는 데 도움을 줍니다.",
  q4: "AI는 사람을 완전히 대신하는 것이 아니라, 분석과 판단을 돕는 기술로 활용됩니다.",
};

function getSelectedAnswer(questionName) {
  const selected = document.querySelector(`input[name="${questionName}"]:checked`);
  return selected ? selected.value : null;
}

function calculateScore() {
  let score = 0;
  let feedback = [];

  for (const key in answers) {
    const userAnswer = getSelectedAnswer(key);

    if (!userAnswer) {
      feedback.push(`<li><strong>${key.toUpperCase()}</strong>: 답을 선택하지 않았습니다.</li>`);
      continue;
    }

    if (userAnswer === answers[key]) {
      score++;
      feedback.push(`<li><strong>${key.toUpperCase()}</strong>: 정답입니다. ${explanations[key]}</li>`);
    } else {
      feedback.push(`<li><strong>${key.toUpperCase()}</strong>: 오답입니다. ${explanations[key]}</li>`);
    }
  }

  return { score, feedback };
}

if (submitQuizBtn) {
  submitQuizBtn.addEventListener("click", () => {
    const { score, feedback } = calculateScore();
    const total = Object.keys(answers).length;

    quizResult.innerHTML = `
      <h3>퀴즈 결과</h3>
      <p>당신의 점수는 <strong>${total}문제 중 ${score}문제 정답</strong>입니다.</p>
      <ul>${feedback.join("")}</ul>
      <p>${
        score === total
          ? "훌륭해요! 기후변화와 AI의 핵심 내용을 잘 이해했어요."
          : score >= 2
          ? "잘했어요! 해설을 읽고 다시 보면 더 확실히 이해할 수 있어요."
          : "괜찮아요. 다시 한 번 내용을 읽고 퀴즈를 풀어보면 더 잘 이해할 수 있어요."
      }</p>
    `;

    quizResult.classList.add("show");
    quizResult.scrollIntoView({ behavior: "smooth", block: "nearest" });
  });
}

if (resetQuizBtn) {
  resetQuizBtn.addEventListener("click", () => {
    if (quizResult) {
      quizResult.innerHTML = "";
      quizResult.classList.remove("show");
    }
  });
}