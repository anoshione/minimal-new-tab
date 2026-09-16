import { renderCalendar } from '../../widgets/calendar.js';
import { renderTodo } from '../../widgets/todo.js';
import { renderHistory } from '../../widgets/history.js';

function renderSidebar(settings) {
    const sidebar = document.getElementById('sidebar');
    sidebar.style.display = 'flex';
    const isLeft = settings.sidebarPosition === 'left';
    sidebar.classList.add(isLeft ? 'left' : 'right');
    document.body.classList.toggle('sidebar-left', isLeft);
    document.body.classList.toggle('sidebar-right', !isLeft);

    const sidebarHandle = document.createElement('div');
    sidebarHandle.className = 'sidebar-handle';
    sidebarHandle.innerHTML = '<span class="sidebar-caret"></span>';
    sidebar.appendChild(sidebarHandle);

    const sidebarContent = document.createElement('div');
    sidebarContent.className = 'sidebar-content';
    sidebar.appendChild(sidebarContent);

    const selectedWidgets = settings.sidebarWidgets || [];

    const widgetRenderers = {
        calendar: renderCalendar,
        todo: renderTodo,
        history: renderHistory
    };

    if (selectedWidgets.length > 0) {
        selectedWidgets.forEach(widgetId => {
            if (widgetRenderers[widgetId]) {
                const widgetContainer = document.createElement('div');
                widgetContainer.classList.add('widget');
                widgetContainer.id = `widget-${widgetId}`;

                const widgetContent = widgetRenderers[widgetId];
                widgetContainer.append(widgetContent());
                sidebarContent.appendChild(widgetContainer);
            }
        });
    } else {
        sidebarContent.innerHTML = '<p style="text-align: center; margin-top: 50px;">No widgets selected. You can add widgets from the Customize menu.</p>';
    }

    if (settings.sidebarExpanded) {
        sidebar.classList.remove('minimised');
    } else {
        sidebar.classList.add('minimised');
    }

    const handle = sidebar.querySelector('.sidebar-handle');
    handle.addEventListener('click', () => {
        sidebar.classList.toggle('minimised');
    });
}

export { renderSidebar };