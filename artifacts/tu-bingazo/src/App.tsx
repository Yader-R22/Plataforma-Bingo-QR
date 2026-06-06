import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "sonner";
import { useAuthStore } from "@/hooks/useAuth";
import HomePage from "@/pages/home";
import LoginPage from "@/pages/login";
import RegisterPage from "@/pages/register";
import GamesPage from "@/pages/games";
import GameDetailPage from "@/pages/game-detail";
import PlayPage from "@/pages/play";
import PaymentPage from "@/pages/payment";
import MyCardsPage from "@/pages/my-cards";
import WalletPage from "@/pages/wallet";
import ProfilePage from "@/pages/profile";
import AdminPage from "@/pages/admin/index";
import CreateGamePage from "@/pages/admin/create-game";
import NotFound from "@/pages/not-found";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function PrivateRoute({ component: Component }: { component: React.ComponentType }) {
  const token = useAuthStore(s => s.token);
  if (!token) return <Redirect to="/login" />;
  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomePage} />
      <Route path="/login" component={LoginPage} />
      <Route path="/registro" component={RegisterPage} />
      <Route path="/juegos" component={GamesPage} />
      <Route path="/juegos/:id/jugar" component={() => <PrivateRoute component={PlayPage} />} />
      <Route path="/juegos/:id" component={GameDetailPage} />
      <Route path="/pago/:checkoutId" component={() => <PrivateRoute component={PaymentPage} />} />
      <Route path="/mis-cartones" component={() => <PrivateRoute component={MyCardsPage} />} />
      <Route path="/billetera" component={() => <PrivateRoute component={WalletPage} />} />
      <Route path="/perfil" component={() => <PrivateRoute component={ProfilePage} />} />
      <Route path="/admin" component={() => <PrivateRoute component={AdminPage} />} />
      <Route path="/admin/crear-juego" component={() => <PrivateRoute component={CreateGamePage} />} />
      <Route path="/admin/editar-juego/:id" component={() => <PrivateRoute component={CreateGamePage} />} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
        <Router />
      </WouterRouter>
      <Toaster position="top-center" richColors closeButton />
    </QueryClientProvider>
  );
}

export default App;
