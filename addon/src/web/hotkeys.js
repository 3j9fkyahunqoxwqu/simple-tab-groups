'use strict';

import { DEFAULT_OPTIONS } from '../js/constants';
import './move-tab-popup.scss';

let hotkeys = [],
    foundHotKey = false,
    EXT_ID = browser.runtime.getManifest().applications.gecko.id;

function changeHotkeysListener(request, sender) {
    if (sender.id !== EXT_ID) {
        return;
    }

    if (request.action === 'update-hotkeys') {
        reloadHotKeys().then(init);
    } else if (request.action === 'move-tab-to-custom-group') {
        showGroupsForMovingTab(request);
    }
}

browser.runtime.onMessage.addListener(changeHotkeysListener);

async function reloadHotKeys() {
    let options = await browser.storage.local.get('hotkeys');

    if (options.hotkeys && Array.isArray(options.hotkeys)) {
        hotkeys = options.hotkeys;
    } else {
        hotkeys = DEFAULT_OPTIONS.hotkeys;
    }
}

reloadHotKeys().then(init);

function init() {
    resetWindowEvents();

    if (hotkeys.length) {
        addWindowEvents();
    }
}

function resetWindowEvents() {
    window.removeEventListener('keydown', checkKey, false);
    window.removeEventListener('keyup', resetFoundHotKey, false);
}

function addWindowEvents() {
    window.addEventListener('keydown', checkKey, false);
    window.addEventListener('keyup', resetFoundHotKey, false);
}

function unsubscribeFromAllEvents() {
    resetWindowEvents();
    browser.runtime.onMessage.removeListener(changeHotkeysListener);
}

function resetFoundHotKey() {
    foundHotKey = false;
}

function checkKey(e) {
    if (foundHotKey || [KeyEvent.DOM_VK_SHIFT, KeyEvent.DOM_VK_CONTROL, KeyEvent.DOM_VK_ALT, KeyEvent.DOM_VK_META].includes(e.keyCode)) { // not track only auxiliary keys
        return;
    }

    hotkeys.some(function(hotkey) {
        if (hotkey.ctrlKey === e.ctrlKey &&
            hotkey.shiftKey === e.shiftKey &&
            hotkey.altKey === e.altKey &&
            hotkey.metaKey === e.metaKey &&
            (
                (hotkey.keyCode && hotkey.keyCode === e.keyCode) ||
                (!hotkey.keyCode && !e.keyCode && hotkey.key.toUpperCase() === e.key.toUpperCase())
            )
        ) {
            foundHotKey = true;

            stopEvent(e);

            browser.runtime.sendMessage({
                    action: hotkey.action,
                    groupId: hotkey.groupId,
                })
                .then(function(response) {
                    foundHotKey = false;

                    if (response && response.unsubscribe) {
                        unsubscribeFromAllEvents();
                    }
                });

            return true;
        }
    });
}

function stopEvent(e) {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
}

const popupId = 'stg-move-tab-to-group-popup-wrapper';

function showGroupsForMovingTab(data) {
    if (window.top !== window || document.getElementById(popupId)) {
        return;
    }

    let wrapper = document.createElement('div'),
        closeGroupsPopup = wrapper.remove.bind(wrapper),
        lastVector = null;

    Object.assign(wrapper, {
        id: popupId,
        onclick: closeGroupsPopup,
        onkeydown: (e) => KeyEvent.DOM_VK_ESCAPE === e.keyCode ? closeGroupsPopup() : null,
    });
    document.body.append(wrapper);

    let main = document.createElement('div');
    main.classList.add('stg-popup-main');
    wrapper.append(main);

    let header = document.createElement('div');
    header.classList = 'stg-popup-has-text stg-popup-header';
    Object.assign(header, {
        tabIndex: '-1',
        innerText: browser.i18n.getMessage('moveTabToGroupDisabledTitle'),
        onclick: e => e.stopPropagation(),
        onkeydown: function(e) {
            if (checkUpDownKeys(e)) {
                return;
            }

            if (KeyEvent.DOM_VK_DOWN === e.keyCode) {
                setFocusToNextElement(groupsWrapper.lastElementChild, 'down', e);
            } else if (KeyEvent.DOM_VK_UP === e.keyCode) {
                setFocusToNextElement(groupsWrapper.firstElementChild, 'up', e);
            }
        },
    });
    main.append(header);

    let groupsWrapper = document.createElement('div');
    groupsWrapper.classList.add('stg-popup-groups-wrapper');
    main.append(groupsWrapper);

    function checkUpDownKeys(e) {
        if ([KeyEvent.DOM_VK_PAGE_UP, KeyEvent.DOM_VK_HOME].includes(e.keyCode)) {
            setFocusToNextElement(groupsWrapper.lastElementChild, 'down', e);
            return true;
        } else if ([KeyEvent.DOM_VK_PAGE_DOWN, KeyEvent.DOM_VK_END].includes(e.keyCode)) {
            setFocusToNextElement(groupsWrapper.firstElementChild, 'up', e);
            return true;
        }
    }

    function createGroupNode(group, tabIndex, isEnabled) {
        let groupNode = document.createElement('div'),
            imgNode = document.createElement('img'),
            titleNode = document.createElement('span');

        groupNode.classList.add('stg-popup-group');

        imgNode.src = group.iconUrl;
        groupNode.append(imgNode);

        titleNode.innerText = group.title;
        titleNode.classList.add('stg-popup-has-text');
        groupNode.append(titleNode);

        groupNode.tabIndex = tabIndex;

        if (isEnabled) {
            groupNode.onmouseover = () => groupsWrapper.contains(document.activeElement) && header.focus();

            groupNode.onclick = function(groupId) {
                browser.runtime.sendMessage(EXT_ID, {
                    action: 'move-active-tab-to-group',
                    groupId: groupId,
                });
                closeGroupsPopup();
            }.bind(null, group.id);

            groupNode.onkeydown = function(e) {
                if (checkUpDownKeys(e)) {
                    return;
                }

                if ([KeyEvent.DOM_VK_RETURN, KeyEvent.DOM_VK_SPACE].includes(e.keyCode)) {
                    stopEvent(e);
                    groupNode.click();
                } else if (KeyEvent.DOM_VK_TAB === e.keyCode) {
                    setFocusToNextElement(groupNode, e.shiftKey ? 'up' : 'down', e);
                } else if (KeyEvent.DOM_VK_DOWN === e.keyCode) {
                    setFocusToNextElement(groupNode, 'down', e);
                } else if (KeyEvent.DOM_VK_UP === e.keyCode) {
                    setFocusToNextElement(groupNode, 'up', e);
                }
            };
        } else {
            groupNode.classList.add('stg-popup-disabled');
            groupNode.onclick = function(e) {
                e.stopPropagation();
                header.focus();
            };
            groupNode.onfocus = function(e) {
                stopEvent(e);

                if (lastVector) {
                    setFocusToNextElement(groupNode, lastVector);
                }
            };
        }

        return groupNode;
    }

    function setFocusToNextElement(node, vector = 'down', eventToStop = false) {
        lastVector = vector;

        if (eventToStop) {
            stopEvent(eventToStop);
        }

        if (1 === groupsWrapper.children.length) {
            groupsWrapper.firstElementChild.focus();
        } else if ('down' === vector) {
            if (node.nextElementSibling) {
                node.nextElementSibling.focus();
            } else {
                groupsWrapper.firstElementChild.focus();
            }
        } else if ('up' === vector) {
            if (node.previousElementSibling) {
                node.previousElementSibling.focus();
            } else {
                groupsWrapper.lastElementChild.focus();
            }
        }

        lastVector = null;
    }

    data.groups.forEach(function(group, index) {
        let groupNode = createGroupNode(group, index + 1, group.id !== data.activeGroupId);
        groupsWrapper.append(groupNode);
    });

    let newGroupNode = createGroupNode({
        id: 'new',
        title: browser.i18n.getMessage('createNewGroup'),
        iconUrl: browser.extension.getURL('/icons/group-new.svg'),
    }, groupsWrapper.children.length + 1, true);

    // newGroupNode.style.justifyContent = 'center';

    groupsWrapper.append(newGroupNode);

    setTimeout(function() {
        wrapper.style.transform = 'none';
        wrapper.style.opacity = '1';
        wrapper.style.visibility = 'visible';

        let hoveredElements = document.querySelectorAll(':hover');

        if (groupsWrapper.contains(hoveredElements[hoveredElements.length - 1])) {
            header.focus();
        } else {
            setFocusToNextElement(groupsWrapper.lastElementChild, 'down');
        }

    }, 0);

}
