#[tauri::command]
pub fn send_download_complete_notification(
    app: tauri::AppHandle,
    title: String,
    body: String,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let app_identifier = if tauri::is_dev() {
            "com.apple.Terminal".to_string()
        } else {
            app.config().identifier.clone()
        };
        let (sender, receiver) = std::sync::mpsc::channel();
        app.run_on_main_thread(move || {
            let result = macos::send_foreground_banner_notification(&app_identifier, &title, &body);
            let _ = sender.send(result);
        })
        .map_err(|error| error.to_string())?;

        return receiver
            .recv_timeout(std::time::Duration::from_secs(3))
            .map_err(|error| error.to_string())?;
    }

    #[cfg(not(target_os = "macos"))]
    {
        use tauri_plugin_notification::NotificationExt;

        app.notification()
            .builder()
            .title(title)
            .body(body)
            .show()
            .map_err(|error| error.to_string())
    }
}

#[cfg(target_os = "macos")]
#[allow(unexpected_cfgs)]
mod macos {
    use objc::declare::ClassDecl;
    use objc::runtime::{Class, Object, Sel, BOOL, YES};
    use objc::{class, msg_send, sel, sel_impl};
    use std::ffi::c_void;
    use std::sync::OnceLock;

    const NS_UTF8_STRING_ENCODING: usize = 4;

    extern "C" fn should_present_notification(
        _: &Object,
        _: Sel,
        _: *mut Object,
        _: *mut Object,
    ) -> BOOL {
        YES
    }

    fn notification_delegate_class() -> &'static Class {
        static CLASS: OnceLock<&'static Class> = OnceLock::new();

        CLASS.get_or_init(|| {
            let superclass = class!(NSObject);
            let mut declaration = ClassDecl::new("YtDlpGuiNotificationCenterDelegate", superclass)
                .expect("failed to declare notification delegate");

            unsafe {
                declaration.add_method(
                    sel!(userNotificationCenter:shouldPresentNotification:),
                    should_present_notification
                        as extern "C" fn(&Object, Sel, *mut Object, *mut Object) -> BOOL,
                );
            }

            declaration.register()
        })
    }

    fn notification_delegate() -> *mut Object {
        static DELEGATE: OnceLock<usize> = OnceLock::new();

        *DELEGATE.get_or_init(|| unsafe {
            let delegate: *mut Object = msg_send![notification_delegate_class(), new];
            delegate as usize
        }) as *mut Object
    }

    unsafe fn ns_string(value: &str) -> Result<*mut Object, String> {
        let string: *mut Object = msg_send![class!(NSString), alloc];
        if string.is_null() {
            return Err("NSString allocation returned null".to_string());
        }
        let bytes = value.as_ptr() as *const c_void;
        let string: *mut Object = msg_send![
            string,
            initWithBytes: bytes
            length: value.len()
            encoding: NS_UTF8_STRING_ENCODING
        ];
        if string.is_null() {
            return Err("NSString initialization returned null".to_string());
        }
        Ok(string)
    }

    fn notification_identifier(app_identifier: &str) -> String {
        let nanos = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_nanos())
            .unwrap_or_default();
        format!("{app_identifier}.download-complete.{nanos}")
    }

    pub fn send_foreground_banner_notification(
        app_identifier: &str,
        title: &str,
        body: &str,
    ) -> Result<(), String> {
        let _ = mac_notification_sys::set_application(app_identifier);

        unsafe {
            let pool: *mut Object = msg_send![class!(NSAutoreleasePool), new];
            let center: *mut Object = msg_send![
                class!(NSUserNotificationCenter),
                defaultUserNotificationCenter
            ];
            if center.is_null() {
                return Err("NSUserNotificationCenter returned null".to_string());
            }

            let delegate = notification_delegate();
            if delegate.is_null() {
                return Err("notification delegate returned null".to_string());
            }
            let _: () = msg_send![center, setDelegate: delegate];

            let notification: *mut Object = msg_send![class!(NSUserNotification), new];
            if notification.is_null() {
                return Err("NSUserNotification allocation returned null".to_string());
            }

            let notification_identifier = ns_string(&notification_identifier(app_identifier))?;
            let notification_title = ns_string(title)?;
            let notification_body = ns_string(body)?;

            let _: () = msg_send![notification, setIdentifier: notification_identifier];
            let _: () = msg_send![notification, setTitle: notification_title];
            let _: () = msg_send![notification, setInformativeText: notification_body];
            let _: () = msg_send![notification, setHasActionButton: false];
            let _: () = msg_send![center, deliverNotification: notification];
            if !pool.is_null() {
                let _: () = msg_send![pool, drain];
            }
        }

        Ok(())
    }
}
