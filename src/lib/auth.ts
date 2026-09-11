/** 서버 오류 문구나 계정 존재 여부를 그대로 노출하지 않는 인증 안내입니다. */
export function authErrorMessage(code?: string): string {
  switch (code) {
    case "invalid_credentials": return "이메일 또는 비밀번호가 올바르지 않아요.";
    case "email_not_confirmed": return "이메일 인증이 필요해요. 받은 메일의 인증 링크를 눌러 주세요.";
    case "weak_password": return "비밀번호가 너무 쉬워요. 영문, 숫자, 특수문자를 섞어 다시 입력해 주세요.";
    case "email_address_invalid": return "올바른 이메일 주소를 입력해 주세요.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit": return "요청이 너무 많아요. 잠시 후 다시 시도해 주세요.";
    case "signup_disabled": return "현재 회원가입을 이용할 수 없어요. 잠시 후 다시 시도해 주세요.";
    default: return "인증을 완료하지 못했어요. 입력 정보와 네트워크를 확인한 뒤 다시 시도해 주세요.";
  }
}

export function validateSignupPassword(password: string, confirmation: string): string {
  if (password.length < 8) return "비밀번호는 8자 이상 입력해 주세요.";
  if (password !== confirmation) return "비밀번호가 일치하지 않아요. 다시 확인해 주세요.";
  return "";
}
