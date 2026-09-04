// Every action an event card offers — register / leave, and edit / publish / cancel —
// shared by the five lists that render one. The card decides which controls to show
// (from the row's own canEdit / canCancel / viewerStatus); this supplies what they do.
import { useCallback, useState } from "react";
import { eventsApi, errMessage } from "../services";
import { useToast } from "../contexts/ToastContext";
import { useConfirm } from "../contexts/ConfirmContext";
import { statusConfirm } from "../utils/events";

export default function useEventActions(onChanged) {
   const toast = useToast();
   const confirm = useConfirm();
   const [editing, setEditing] = useState(null);
   const [busyId, setBusyId] = useState(null);

   // List rows are the compact shape; the editor needs the description, tags and
   // deadline that only the detail call carries.
   const openEditor = useCallback(
      async (row) => {
         setBusyId(row.id);
         try {
            const d = await eventsApi.getEvent(row.id);
            setEditing(d?.event || null);
         } catch (err) {
            toast.error(
               errMessage(err, "Couldn't open that event"),
            );
         } finally {
            setBusyId(null);
         }
      },
      [toast],
   );

   const registerEvent = useCallback(
      async (row) => {
         setBusyId(row.id);
         try {
            const res = await eventsApi.registerForEvent(row.id);
            toast.success(
               res?.registration?.status === "waitlisted"
                  ? "Added to the waitlist"
                  : "You're registered",
            );
            onChanged?.();
         } catch (err) {
            toast.error(errMessage(err, "Couldn't register"));
         } finally {
            setBusyId(null);
         }
      },
      [toast, onChanged],
   );

   const leaveEvent = useCallback(
      async (row) => {
         const ok = await confirm({
            title: `Cancel your spot at “${row.title}”?`,
            message: "Your seat goes to the next person on the waitlist.",
            confirmLabel: "Cancel registration",
            danger: true,
         });
         if (!ok) return;
         setBusyId(row.id);
         try {
            await eventsApi.unregisterFromEvent(row.id);
            toast.success("Registration cancelled");
            onChanged?.();
         } catch (err) {
            toast.error(errMessage(err, "Couldn't cancel"));
         } finally {
            setBusyId(null);
         }
      },
      [confirm, toast, onChanged],
   );

   const publishEvent = useCallback(
      async (row) => {
         const ok = await confirm(statusConfirm("published", row.title));
         if (!ok) return;
         setBusyId(row.id);
         try {
            await eventsApi.setEventStatus(row.club?.slug, row.id, "published");
            toast.success("Event published");
            onChanged?.();
         } catch (err) {
            toast.error(
               errMessage(err, "Couldn't publish"),
            );
         } finally {
            setBusyId(null);
         }
      },
      [confirm, toast, onChanged],
   );

   const cancelEvent = useCallback(
      async (row) => {
         const ok = await confirm(statusConfirm("cancelled", row.title));
         if (!ok) return;
         setBusyId(row.id);
         try {
            await eventsApi.setEventStatus(row.club?.slug, row.id, "cancelled");
            toast.success("Event cancelled");
            onChanged?.();
         } catch (err) {
            toast.error(
               errMessage(err, "Couldn't cancel the event"),
            );
         } finally {
            setBusyId(null);
         }
      },
      [confirm, toast, onChanged],
   );

   return {
      editing,
      setEditing,
      busyId,
      openEditor,
      registerEvent,
      leaveEvent,
      publishEvent,
      cancelEvent,
   };
}
