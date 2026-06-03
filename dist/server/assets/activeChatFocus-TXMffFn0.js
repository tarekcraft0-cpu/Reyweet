let activeChatId = null;
function setActiveChatFocus(chatId) {
  activeChatId = chatId?.trim() || null;
}
function getActiveChatFocus() {
  return activeChatId;
}
export {
  getActiveChatFocus,
  setActiveChatFocus
};
